// The OG share card, rendered by the engine itself: dark banner, pixel-font
// wordmark, the loom logo, and a row of real example sprites. 1200x630 RGBA.

import { resolvePalette, runRecipe, type Grid } from "./engine";
import { EXAMPLES } from "./examples";
import { LOGO } from "./logo";
import type { RgbaImage } from "./voxel";

const W = 1200;
const H = 630;

// minimal 3x5 pixel font, caps only — enough for the banner copy
const FONT: Record<string, number[]> = {
  A: [0b111, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b111, 0b100, 0b100, 0b100, 0b111],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b111, 0b100, 0b111],
  F: [0b111, 0b100, 0b111, 0b100, 0b100],
  G: [0b111, 0b100, 0b101, 0b101, 0b111],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b111],
  K: [0b101, 0b101, 0b110, 0b101, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b110, 0b101, 0b101, 0b101, 0b101],
  O: [0b111, 0b101, 0b101, 0b101, 0b111],
  P: [0b111, 0b101, 0b111, 0b100, 0b100],
  R: [0b111, 0b101, 0b111, 0b110, 0b101],
  S: [0b111, 0b100, 0b111, 0b001, 0b111],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b111],
  V: [0b101, 0b101, 0b101, 0b101, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b111, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  " ": [0, 0, 0, 0, 0],
};

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function px(img: Uint8Array, x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  img[i] = c[0];
  img[i + 1] = c[1];
  img[i + 2] = c[2];
  img[i + 3] = 255;
}

function block(img: Uint8Array, x: number, y: number, size: number, c: [number, number, number]): void {
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) px(img, x + dx, y + dy, c);
}

function drawText(img: Uint8Array, text: string, x: number, y: number, scale: number, c: [number, number, number]): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "]!;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row]! & (1 << (2 - col))) block(img, cx + col * scale, y + row * scale, scale, c);
      }
    }
    cx += 4 * scale;
  }
}

function blitGrid(img: Uint8Array, grid: Grid, colors: string[], x: number, y: number, scale: number): void {
  const rgb = colors.map(hexToRgb);
  for (let gy = 0; gy < grid.size; gy++) {
    for (let gx = 0; gx < grid.size; gx++) {
      const v = grid.data[gy * grid.size + gx]!;
      if (v === 0) continue;
      block(img, x + gx * scale, y + gy * scale, scale, rgb[v] ?? [255, 0, 255]);
    }
  }
}

const BG = hexToRgb("#151515");
const FG = hexToRgb("#e0e0cc");
const GOLD = hexToRgb("#e0b040");
const DIM = hexToRgb("#8e8e7e");

export function renderOgCard(): RgbaImage {
  const img = new Uint8Array(W * H * 4);

  // background
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(img, x, y, BG);

  // double pixel frame
  for (let x = 24; x < W - 24; x++) {
    px(img, x, 24, FG);
    px(img, x, 25, FG);
    px(img, x, H - 26, FG);
    px(img, x, H - 25, FG);
  }
  for (let y = 24; y < H - 24; y++) {
    px(img, 24, y, FG);
    px(img, 25, y, FG);
    px(img, W - 26, y, FG);
    px(img, W - 25, y, FG);
  }

  // logo, left
  const logoGrid = runRecipe(LOGO);
  blitGrid(img, logoGrid, resolvePalette(LOGO.palette).colors, 80, 96, 13);

  // wordmark + taglines
  drawText(img, "SPRITELOOM", 330, 110, 18, FG);
  drawText(img, "PIXEL ART AS CODE", 334, 232, 8, GOLD);
  drawText(img, "A SPRITE FOUNDRY FOR HUMANS AND AI AGENTS", 334, 296, 5, DIM);

  // a row of real sprites along the bottom (integer x — fractional coords
  // silently no-op on typed arrays)
  const names = ["skull", "sword", "potion", "slime", "tree", "wall", "key", "heart"];
  const scale = 7;
  const spriteW = 16 * scale;
  const span = W - 2 * 76 - spriteW;
  names.forEach((name, i) => {
    const recipe = EXAMPLES.find((e) => e.name === name);
    if (!recipe) return;
    const x = 76 + Math.round((i * span) / (names.length - 1));
    blitGrid(img, runRecipe(recipe), resolvePalette(recipe.palette).colors, x, 424, scale);
  });

  return { width: W, height: H, data: img };
}
