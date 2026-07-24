// Minimal PNG encoder for indexed low-color images (bit depth 1, 2, or 4,
// chosen from the palette size). No dependencies — uses
// CompressionStream("deflate") for the zlib stream, which exists in browsers,
// Cloudflare Workers, and Bun.

import { resolvePalette, type Grid, type Palette } from "./engine";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export const MAX_SCALE = 32;
export const MAX_OUTPUT_PX = 2048;

export function clampScale(size: number, scale: number): number {
  const s = Math.max(1, Math.min(MAX_SCALE, Math.floor(scale)));
  return Math.min(s, Math.max(1, Math.floor(MAX_OUTPUT_PX / size)));
}

export function bitDepthFor(colorCount: number): 1 | 2 | 4 {
  if (colorCount <= 2) return 1;
  if (colorCount <= 4) return 2;
  return 4;
}

/**
 * Encode a grid of palette indices as an indexed-color PNG. Index 0 is the
 * background; with palette.transparent it is fully transparent via tRNS.
 */
export async function encodePng(grid: Grid, palette: Palette = {}, scale = 1): Promise<Uint8Array> {
  const { colors, transparent } = resolvePalette(palette);
  const depth = bitDepthFor(colors.length);
  const s = clampScale(grid.size, scale);
  const dim = grid.size * s;
  const rowBytes = Math.ceil((dim * depth) / 8);

  const raw = new Uint8Array((rowBytes + 1) * dim);
  for (let y = 0; y < dim; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter: None
    const srcY = Math.floor(y / s);
    for (let x = 0; x < dim; x++) {
      const srcX = Math.floor(x / s);
      const v = grid.data[srcY * grid.size + srcX]!;
      if (v === 0) continue;
      const bitPos = x * depth;
      raw[rowStart + 1 + (bitPos >> 3)]! |= v << (8 - depth - (bitPos & 7));
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, dim);
  ihdrView.setUint32(4, dim);
  ihdr[8] = depth;
  ihdr[9] = 3; // color type: indexed
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const plte = new Uint8Array(colors.length * 3);
  colors.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    plte[i * 3] = r;
    plte[i * 3 + 1] = g;
    plte[i * 3 + 2] = b;
  });

  const chunks: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("PLTE", plte),
  ];
  if (transparent) {
    chunks.push(chunk("tRNS", new Uint8Array([0])));
  }
  chunks.push(chunk("IDAT", await zlibDeflate(raw)));
  chunks.push(chunk("IEND", new Uint8Array(0)));

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** Encode an RGBA buffer as a truecolor+alpha PNG (used for iso renders). */
export async function encodePngRgba(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const rowBytes = width * 4;
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter: None
    raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), rowStart + 1);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlibDeflate(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
