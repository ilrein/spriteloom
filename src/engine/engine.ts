// spriteloom engine — a deliberately tiny, deterministic low-color raster DSL.
// A sprite is a Recipe: a canvas size, an indexed palette (2–16 colors), and a
// list of ops. Every pixel is a palette index; ops write indices via `v`.
// The same interpreter runs in the browser (live preview) and in the Worker (API).

/** A pixel value: a palette index, 0..MAX_COLORS-1. Index 0 is the background. */
export type Cell = number;

export interface Palette {
  /** indexed colors; index 0 is the background. 2–16 entries. */
  colors?: string[];
  /** legacy 1-bit form: color for value 1 (becomes colors[1]) */
  fg?: string;
  /** legacy 1-bit form: color for value 0 (becomes colors[0]) */
  bg?: string;
  /** render index-0 pixels as transparent in PNG output */
  transparent?: boolean;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Op =
  | { op: "px"; at: [number, number][]; v?: Cell }
  | { op: "rect"; x: number; y: number; w: number; h: number; v?: Cell; mode?: "fill" | "stroke" }
  | { op: "line"; from: [number, number]; to: [number, number]; v?: Cell }
  | { op: "ellipse"; cx: number; cy: number; rx: number; ry: number; v?: Cell; mode?: "fill" | "stroke" }
  | { op: "fill"; x: number; y: number; v?: Cell }
  | { op: "mirror"; axis: "x" | "y" }
  | { op: "outline"; v?: Cell }
  | { op: "dither"; x: number; y: number; w: number; h: number; pattern: DitherPattern; v?: Cell }
  | { op: "scatter"; x: number; y: number; w: number; h: number; density: number; seed?: number; v?: Cell }
  | { op: "replace"; from: Cell; to: Cell; region?: Region }
  | { op: "invert"; region?: Region; a?: Cell; b?: Cell }
  | { op: "shift"; dx: number; dy: number; wrap?: boolean }
  | { op: "clear"; region?: Region };

export type DitherPattern = "checker" | "sparse" | "dense" | "hlines" | "vlines";

export interface Recipe {
  size: number;
  name?: string;
  palette?: Palette;
  ops: Op[];
}

export const MIN_SIZE = 8;
export const MAX_SIZE = 64;
export const MAX_OPS = 256;
export const MAX_COLORS = 16;
export const DEFAULT_FG = "#e0e0cc";
export const DEFAULT_BG = "#151515";

/** Normalize the palette forms (indexed colors vs legacy fg/bg) into one shape. */
export function resolvePalette(palette?: Palette): { colors: string[]; transparent: boolean } {
  if (palette?.colors && palette.colors.length >= 2) {
    return { colors: palette.colors.slice(0, MAX_COLORS), transparent: palette.transparent ?? false };
  }
  return {
    colors: [palette?.bg ?? DEFAULT_BG, palette?.fg ?? DEFAULT_FG],
    transparent: palette?.transparent ?? false,
  };
}

export interface Grid {
  size: number;
  data: Uint8Array;
}

export function createGrid(size: number): Grid {
  return { size, data: new Uint8Array(size * size) };
}

function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.size && y < g.size;
}

function set(g: Grid, x: number, y: number, v: Cell): void {
  if (inBounds(g, x, y)) g.data[y * g.size + x] = v;
}

export function get(g: Grid, x: number, y: number): Cell {
  return inBounds(g, x, y) ? g.data[y * g.size + x]! : 0;
}

/** Deterministic PRNG so `scatter` renders identically everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampRegion(g: Grid, r: Region): Region {
  const x = Math.max(0, r.x);
  const y = Math.max(0, r.y);
  const w = Math.min(g.size, r.x + r.w) - x;
  const h = Math.min(g.size, r.y + r.h) - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

function drawRect(g: Grid, o: Extract<Op, { op: "rect" }>): void {
  const v = o.v ?? 1;
  if ((o.mode ?? "fill") === "fill") {
    const r = clampRegion(g, o);
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) set(g, x, y, v);
  } else {
    for (let x = o.x; x < o.x + o.w; x++) {
      set(g, x, o.y, v);
      set(g, x, o.y + o.h - 1, v);
    }
    for (let y = o.y; y < o.y + o.h; y++) {
      set(g, o.x, y, v);
      set(g, o.x + o.w - 1, y, v);
    }
  }
}

function drawLine(g: Grid, o: Extract<Op, { op: "line" }>): void {
  const v = o.v ?? 1;
  let [x0, y0] = o.from;
  const [x1, y1] = o.to;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    set(g, x0, y0, v);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function insideEllipse(o: { cx: number; cy: number; rx: number; ry: number }, x: number, y: number): boolean {
  const nx = (x - o.cx) / (o.rx + 0.5);
  const ny = (y - o.cy) / (o.ry + 0.5);
  return nx * nx + ny * ny <= 1;
}

function drawEllipse(g: Grid, o: Extract<Op, { op: "ellipse" }>): void {
  const v = o.v ?? 1;
  const stroke = (o.mode ?? "fill") === "stroke";
  for (let y = o.cy - o.ry; y <= o.cy + o.ry; y++) {
    for (let x = o.cx - o.rx; x <= o.cx + o.rx; x++) {
      if (!insideEllipse(o, x, y)) continue;
      if (stroke) {
        const edge =
          !insideEllipse(o, x - 1, y) ||
          !insideEllipse(o, x + 1, y) ||
          !insideEllipse(o, x, y - 1) ||
          !insideEllipse(o, x, y + 1);
        if (!edge) continue;
      }
      set(g, x, y, v);
    }
  }
}

function floodFill(g: Grid, o: Extract<Op, { op: "fill" }>): void {
  const v = o.v ?? 1;
  if (!inBounds(g, o.x, o.y)) return;
  const target = get(g, o.x, o.y);
  if (target === v) return;
  const stack: number[] = [o.y * g.size + o.x];
  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (g.data[idx] !== target) continue;
    g.data[idx] = v;
    const x = idx % g.size;
    const y = (idx - x) / g.size;
    if (x > 0) stack.push(idx - 1);
    if (x < g.size - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - g.size);
    if (y < g.size - 1) stack.push(idx + g.size);
  }
}

function mirror(g: Grid, axis: "x" | "y"): void {
  const half = Math.floor(g.size / 2);
  if (axis === "x") {
    // copy left half onto right half, flipped
    for (let y = 0; y < g.size; y++)
      for (let x = 0; x < half; x++) set(g, g.size - 1 - x, y, get(g, x, y));
  } else {
    // copy top half onto bottom half, flipped
    for (let y = 0; y < half; y++)
      for (let x = 0; x < g.size; x++) set(g, x, g.size - 1 - y, get(g, x, y));
  }
}

function outline(g: Grid, v: Cell): void {
  const src = g.data.slice();
  const at = (x: number, y: number): Cell =>
    x >= 0 && y >= 0 && x < g.size && y < g.size ? src[y * g.size + x]! : 0;
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (at(x, y) !== 0) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) set(g, x, y, v);
    }
  }
}

const PATTERNS: Record<DitherPattern, (x: number, y: number) => boolean> = {
  checker: (x, y) => (x + y) % 2 === 0,
  sparse: (x, y) => x % 2 === 0 && y % 2 === 0,
  dense: (x, y) => !(x % 2 === 0 && y % 2 === 0),
  hlines: (_x, y) => y % 2 === 0,
  vlines: (x, _y) => x % 2 === 0,
};

function dither(g: Grid, o: Extract<Op, { op: "dither" }>): void {
  const v = o.v ?? 1;
  const r = clampRegion(g, o);
  const test = PATTERNS[o.pattern];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (test(x, y)) set(g, x, y, v);
}

function scatter(g: Grid, o: Extract<Op, { op: "scatter" }>): void {
  const v = o.v ?? 1;
  const rand = mulberry32(o.seed ?? 1);
  const r = clampRegion(g, o);
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (rand() < o.density) set(g, x, y, v);
}

function replace(g: Grid, o: Extract<Op, { op: "replace" }>): void {
  const r = clampRegion(g, o.region ?? { x: 0, y: 0, w: g.size, h: g.size });
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const idx = y * g.size + x;
      if (g.data[idx] === o.from) g.data[idx] = o.to;
    }
}

function invert(g: Grid, o: Extract<Op, { op: "invert" }>): void {
  const a = o.a ?? 0;
  const b = o.b ?? 1;
  const r = clampRegion(g, o.region ?? { x: 0, y: 0, w: g.size, h: g.size });
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const idx = y * g.size + x;
      if (g.data[idx] === a) g.data[idx] = b;
      else if (g.data[idx] === b) g.data[idx] = a;
    }
}

function shift(g: Grid, o: Extract<Op, { op: "shift" }>): void {
  const src = g.data.slice();
  const n = g.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let sx = x - o.dx;
      let sy = y - o.dy;
      if (o.wrap) {
        sx = ((sx % n) + n) % n;
        sy = ((sy % n) + n) % n;
      }
      g.data[y * n + x] =
        sx >= 0 && sy >= 0 && sx < n && sy < n ? src[sy * n + sx]! : 0;
    }
  }
}

function clear(g: Grid, region?: Region): void {
  if (!region) {
    g.data.fill(0);
    return;
  }
  const r = clampRegion(g, region);
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) g.data[y * g.size + x] = 0;
}

export function applyOp(g: Grid, o: Op): void {
  switch (o.op) {
    case "px":
      for (const [x, y] of o.at) set(g, x, y, o.v ?? 1);
      break;
    case "rect":
      drawRect(g, o);
      break;
    case "line":
      drawLine(g, o);
      break;
    case "ellipse":
      drawEllipse(g, o);
      break;
    case "fill":
      floodFill(g, o);
      break;
    case "mirror":
      mirror(g, o.axis);
      break;
    case "outline":
      outline(g, o.v ?? 1);
      break;
    case "dither":
      dither(g, o);
      break;
    case "scatter":
      scatter(g, o);
      break;
    case "replace":
      replace(g, o);
      break;
    case "invert":
      invert(g, o);
      break;
    case "shift":
      shift(g, o);
      break;
    case "clear":
      clear(g, o.region);
      break;
  }
}

export function runRecipe(recipe: Recipe): Grid {
  const g = createGrid(recipe.size);
  for (const op of recipe.ops) applyOp(g, op);
  return g;
}

/** ASCII charset per palette index: 0 → ".", 1 → "#", 2..15 → "23456789abcdef". */
export const ASCII_CHARS = ".#23456789abcdef";

/** Render a grid as ASCII art, one char per pixel using ASCII_CHARS. */
export function toAscii(g: Grid): string {
  const rows: string[] = [];
  for (let y = 0; y < g.size; y++) {
    let row = "";
    for (let x = 0; x < g.size; x++) row += ASCII_CHARS[g.data[y * g.size + x]!] ?? "?";
    rows.push(row);
  }
  return rows.join("\n");
}
