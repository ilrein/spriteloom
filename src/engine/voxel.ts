// Voxel extension: sprites lift into voxel grids via three deterministic
// strategies (extrude, inflate, carve), rendered by a software isometric
// renderer and exported as MagicaVoxel .vox. No WebGL, no dependencies —
// same philosophy as the 2D engine.

import { resolvePalette, type Grid, type Palette, type Recipe } from "./engine";
import { runRecipe } from "./engine";

export interface VoxelGrid {
  /** x = right, y = down (sprite plane), z = depth (0 = front) */
  sx: number;
  sy: number;
  sz: number;
  data: Uint8Array; // palette indices, index = (z * sy + y) * sx + x
}

export type VoxelMode = "extrude" | "inflate" | "carve";

function createVoxels(sx: number, sy: number, sz: number): VoxelGrid {
  return { sx, sy, sz, data: new Uint8Array(sx * sy * sz) };
}

function vset(v: VoxelGrid, x: number, y: number, z: number, val: number): void {
  if (x >= 0 && y >= 0 && z >= 0 && x < v.sx && y < v.sy && z < v.sz) {
    v.data[(z * v.sy + y) * v.sx + x] = val;
  }
}

export function vget(v: VoxelGrid, x: number, y: number, z: number): number {
  if (x < 0 || y < 0 || z < 0 || x >= v.sx || y >= v.sy || z >= v.sz) return 0;
  return v.data[(z * v.sy + y) * v.sx + x]!;
}

/** Uniform (or per-index) extrusion: the classic cookie. */
export function extrude(grid: Grid, depth: number, perIndexDepth = false): VoxelGrid {
  const d = Math.max(1, Math.min(grid.size, depth));
  const v = createVoxels(grid.size, grid.size, d);
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const val = grid.data[y * grid.size + x]!;
      if (val === 0) continue;
      // higher palette index = deeper relief when perIndexDepth is on
      const dd = perIndexDepth ? Math.max(1, Math.round((val / 15) * (d - 1)) + 1) : d;
      for (let z = 0; z < dd; z++) vset(v, x, y, z, val);
    }
  }
  return v;
}

/** Chebyshev distance to the nearest transparent pixel, two-pass. */
function edgeDistance(grid: Grid): Int16Array {
  const n = grid.size;
  const INF = 1 << 14;
  const dist = new Int16Array(n * n);
  for (let i = 0; i < n * n; i++) dist[i] = grid.data[i]! === 0 ? 0 : INF;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= n || y >= n ? 0 : dist[y * n + x]!);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.min(at(x, y), at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1, at(x + 1, y - 1) + 1);
      dist[y * n + x] = d;
    }
  for (let y = n - 1; y >= 0; y--)
    for (let x = n - 1; x >= 0; x--) {
      const d = Math.min(at(x, y), at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1, at(x - 1, y + 1) + 1);
      dist[y * n + x] = d;
    }
  return dist;
}

/** Balloon the silhouette: thickness grows toward the middle of the shape. */
export function inflate(grid: Grid, maxDepth: number): VoxelGrid {
  const n = grid.size;
  const cap = Math.max(2, Math.min(n, maxDepth));
  const dist = edgeDistance(grid);
  let peak = 1;
  for (let i = 0; i < n * n; i++) peak = Math.max(peak, dist[i]!);
  const v = createVoxels(n, n, cap);
  const mid = (cap - 1) / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const val = grid.data[y * n + x]!;
      if (val === 0) continue;
      // spherical profile: thickness = cap * sqrt(1 - (1 - d/peak)^2)
      const t = dist[y * n + x]! / peak;
      const half = Math.max(0.5, (cap / 2) * Math.sqrt(1 - (1 - t) * (1 - t)));
      const z0 = Math.max(0, Math.round(mid - half + 0.5));
      const z1 = Math.min(cap - 1, Math.round(mid + half - 0.5));
      for (let z = z0; z <= z1; z++) vset(v, x, y, z, val);
    }
  }
  return v;
}

/**
 * Visual-hull carving from two views: front (x,y) and side (z,y — the side
 * sprite's x axis becomes depth). A voxel is solid where both silhouettes
 * agree; color comes from the front view.
 */
export function carve(front: Grid, side: Grid): VoxelGrid {
  const n = front.size;
  const v = createVoxels(n, n, side.size);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const val = front.data[y * n + x]!;
      if (val === 0) continue;
      for (let z = 0; z < side.size; z++) {
        if (y < side.size && side.data[y * side.size + z]! !== 0) vset(v, x, y, z, val);
      }
    }
  }
  return v;
}

export function spriteToVoxels(recipe: Recipe, mode: VoxelMode, depth: number, sideRecipe?: Recipe): VoxelGrid {
  const grid = runRecipe(recipe);
  if (mode === "carve") {
    if (!sideRecipe) throw new Error("carve mode needs a side view recipe");
    return carve(grid, runRecipe(sideRecipe));
  }
  if (mode === "inflate") return inflate(grid, depth);
  return extrude(grid, depth);
}

// ---- isometric software renderer ----

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function shade(rgb: [number, number, number], f: number): [number, number, number] {
  return [Math.round(rgb[0] * f), Math.round(rgb[1] * f), Math.round(rgb[2] * f)];
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

/**
 * Render the voxel grid as pixel-art isometric. Each voxel is a 4x2 top
 * diamond over 4px-tall side faces (so sprites keep their height); painter
 * order handles occlusion with z=0 treated as nearest to the camera.
 * Faces: front (sprite plane) = full color, top = 115%, side = 60%.
 */
export function renderIso(v: VoxelGrid, palette: Palette = {}): RgbaImage {
  const { colors } = resolvePalette(palette);
  const rgb = colors.map(hexToRgb);

  const SIDE_H = 4;
  const width = (v.sx + v.sz) * 2;
  const height = v.sx + v.sz + v.sy * SIDE_H + 2;
  const img = new Uint8Array(width * height * 4);

  const put = (px: number, py: number, c: [number, number, number]): void => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const i = (py * width + px) * 4;
    img[i] = c[0];
    img[i + 1] = c[1];
    img[i + 2] = c[2];
    img[i + 3] = 255;
  };

  const originX = (v.sz - 1) * 2;

  // zz = sz-1-z so the sprite's front face (z=0) is nearest; painter order is
  // ascending x+zz (far to near), bottom voxel first within a column so the
  // voxel above overwrites where its sides cover the lower one's top
  for (let s = 0; s <= v.sx + v.sz - 2; s++) {
    for (let y = v.sy - 1; y >= 0; y--) {
      for (let x = Math.max(0, s - v.sz + 1); x <= Math.min(v.sx - 1, s); x++) {
        const zz = s - x;
        const z = v.sz - 1 - zz;
        const val = vget(v, x, y, z);
        if (val === 0) continue;
        if (
          vget(v, x + 1, y, z) &&
          vget(v, x, y + 1, z) &&
          vget(v, x, y, z - 1) &&
          vget(v, x - 1, y, z) &&
          vget(v, x, y - 1, z) &&
          vget(v, x, y, z + 1)
        ) {
          continue;
        }
        const base = rgb[val] ?? [255, 0, 255];
        const top: [number, number, number] = [
          Math.min(255, Math.round(base[0] * 1.15 + 12)),
          Math.min(255, Math.round(base[1] * 1.15 + 12)),
          Math.min(255, Math.round(base[2] * 1.15 + 12)),
        ];
        const front = base;
        const side = shade(base, 0.6);
        const sx0 = originX + (x - zz) * 2;
        const sy0 = x + zz + y * SIDE_H;
        // top diamond (4x2)
        put(sx0 + 1, sy0, top);
        put(sx0 + 2, sy0, top);
        put(sx0, sy0 + 1, top);
        put(sx0 + 1, sy0 + 1, top);
        put(sx0 + 2, sy0 + 1, top);
        put(sx0 + 3, sy0 + 1, top);
        // left half = side face (depth), right half = front face (sprite plane)
        for (let row = 2; row < 2 + SIDE_H; row++) {
          put(sx0, sy0 + row, side);
          put(sx0 + 1, sy0 + row, side);
          put(sx0 + 2, sy0 + row, front);
          put(sx0 + 3, sy0 + row, front);
        }
      }
    }
  }

  return { width, height, data: img };
}

/** Nearest-neighbor upscale for RGBA images. */
export function scaleRgba(img: RgbaImage, scale: number): RgbaImage {
  const s = Math.max(1, Math.floor(scale));
  if (s === 1) return img;
  const width = img.width * s;
  const height = img.height * s;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = Math.floor(y / s);
    for (let x = 0; x < width; x++) {
      const srcX = Math.floor(x / s);
      const si = (srcY * img.width + srcX) * 4;
      const di = (y * width + x) * 4;
      out[di] = img.data[si]!;
      out[di + 1] = img.data[si + 1]!;
      out[di + 2] = img.data[si + 2]!;
      out[di + 3] = img.data[si + 3]!;
    }
  }
  return { width, height, data: out };
}

// ---- MagicaVoxel .vox export ----

/** Encode as MagicaVoxel .vox (version 150): SIZE + XYZI + RGBA chunks. */
export function encodeVox(v: VoxelGrid, palette: Palette = {}): Uint8Array {
  const { colors } = resolvePalette(palette);

  const voxels: number[] = [];
  for (let z = 0; z < v.sz; z++) {
    for (let y = 0; y < v.sy; y++) {
      for (let x = 0; x < v.sx; x++) {
        const val = vget(v, x, y, z);
        if (val === 0) continue;
        // spriteloom: x right, y down, z toward viewer → vox: x right, y depth, z up
        voxels.push(x, v.sz - 1 - z, v.sy - 1 - y, val);
      }
    }
  }

  const str = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const i32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];

  const sizeContent = [...i32(v.sx), ...i32(v.sz), ...i32(v.sy)];
  const xyziContent = [...i32(voxels.length / 4), ...voxels];
  const rgbaContent: number[] = [];
  for (let i = 0; i < 256; i++) {
    // vox palette slot i is referenced by color index i+1
    const hex = colors[i + 1];
    const [r, g, b] = hex ? hexToRgb(hex) : [0, 0, 0];
    rgbaContent.push(r, g, b, 255);
  }

  const chunk = (id: string, content: number[], children: number[] = []) => [
    ...str(id),
    ...i32(content.length),
    ...i32(children.length),
    ...content,
    ...children,
  ];

  const children = [...chunk("SIZE", sizeContent), ...chunk("XYZI", xyziContent), ...chunk("RGBA", rgbaContent)];
  const main = chunk("MAIN", [], children);
  return new Uint8Array([...str("VOX "), ...i32(150), ...main]);
}

/** ASCII z-slices (front slice first) — agents read voxel models as text. */
export function voxelsToAscii(v: VoxelGrid): string {
  const CHARS = ".#23456789abcdef";
  const slices: string[] = [];
  for (let z = 0; z < v.sz; z++) {
    const rows: string[] = [`-- z=${z}${z === 0 ? " (front)" : ""}`];
    for (let y = 0; y < v.sy; y++) {
      let row = "";
      for (let x = 0; x < v.sx; x++) row += CHARS[vget(v, x, y, z)] ?? "?";
      rows.push(row);
    }
    slices.push(rows.join("\n"));
  }
  return slices.join("\n\n");
}
