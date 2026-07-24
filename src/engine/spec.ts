// Machine-readable DSL spec, served at GET /api/spec so agents can learn the
// tool without out-of-band docs. Keep in sync with engine.ts and validate.ts.

import { MAX_COLORS, MAX_OPS, MAX_SIZE, MIN_SIZE } from "./engine";
import { MAX_SCALE } from "./png";

export const SPEC = {
  name: "spriteloom",
  version: 2,
  description:
    "Deterministic low-color sprite DSL. A recipe is {size, palette?, ops[]}. " +
    "The canvas is size x size; every pixel is a palette index (0 = background). Ops apply in order " +
    "and write the index given by their `v` param (default 1). " +
    "Style target: lightweight retro sprites — 1-bit up to 16 colors (Urizen, Kenney, PICO-8 territory).",
  constraints: {
    size: { min: MIN_SIZE, max: MAX_SIZE },
    maxOps: MAX_OPS,
    maxRenderScale: MAX_SCALE,
    colors: `2-${MAX_COLORS} indexed colors. No gradients, no anti-aliasing — every pixel is one palette entry.`,
  },
  recipe: {
    size: "int, canvas is size x size",
    name: "optional string",
    palette: {
      colors: `optional array of 2-${MAX_COLORS} hex colors; index 0 is the background. Default ["#151515", "#e0e0cc"]`,
      transparent: "optional bool; if true, index-0 pixels are transparent in PNG output",
      fg: "legacy 1-bit form: color for index 1",
      bg: "legacy 1-bit form: color for index 0",
    },
    ops: "array of op objects, applied in order",
  },
  ops: {
    px: { params: { at: "[[x,y], ...]", v: "palette index, default 1" }, doc: "Set individual pixels." },
    rect: {
      params: { x: "int", y: "int", w: "int", h: "int", mode: '"fill"|"stroke", default fill', v: "palette index" },
      doc: "Filled or outlined rectangle.",
    },
    line: { params: { from: "[x,y]", to: "[x,y]", v: "palette index" }, doc: "Bresenham line." },
    ellipse: {
      params: { cx: "int", cy: "int", rx: "int", ry: "int", mode: '"fill"|"stroke", default fill', v: "palette index" },
      doc: "Ellipse centered at (cx,cy). rx=ry gives a circle.",
    },
    fill: { params: { x: "int", y: "int", v: "palette index" }, doc: "Flood fill (4-connected) the region of same-valued pixels containing (x,y)." },
    mirror: {
      params: { axis: '"x"|"y"' },
      doc: 'Symmetry: "x" copies the left half onto the right (mirror across the vertical center line); "y" copies top onto bottom. Draw one half, then mirror.',
    },
    outline: { params: { v: "palette index, default 1" }, doc: "Set every background (index 0) pixel 4-adjacent to any non-background pixel. Outlines the whole silhouette." },
    dither: {
      params: { x: "int", y: "int", w: "int", h: "int", pattern: '"checker"|"sparse"|"dense"|"hlines"|"vlines"', v: "palette index" },
      doc: "Paint a repeating texture in a region. sparse=25%, checker=50%, dense=75%. Great for shading with a darker palette index.",
    },
    scatter: {
      params: { x: "int", y: "int", w: "int", h: "int", density: "0..1", seed: "int, default 1", v: "palette index" },
      doc: "Seeded random speckle in a region. Deterministic for a given seed.",
    },
    replace: {
      params: { from: "palette index", to: "palette index", region: "optional {x,y,w,h}" },
      doc: "Recolor: every `from` pixel becomes `to`. The cheap way to make color variants of a shape.",
    },
    invert: { params: { a: "palette index, default 0", b: "palette index, default 1", region: "optional {x,y,w,h}" }, doc: "Swap values a and b in region (or whole canvas)." },
    shift: { params: { dx: "int", dy: "int", wrap: "bool, default false" }, doc: "Translate the whole canvas." },
    clear: { params: { region: "optional {x,y,w,h}" }, doc: "Reset a region (or whole canvas) to index 0." },
  },
  ascii:
    'In text/json output each pixel is one char by palette index: 0 → ".", 1 → "#", 2-15 → "23456789abcdef".',
  api: {
    "POST /api/render":
      "Body: recipe JSON. Query: scale (int, nearest-neighbor upscale), format=png|text|json. " +
      "png returns image/png (indexed, bit depth 1/2/4 by palette size); " +
      "text returns ASCII art — use this to inspect your result and iterate; " +
      "json returns {name, size, palette, rows}. Invalid recipes return 400 with {errors: [...]}.",
    "GET /api/spec": "This document.",
    "GET /api/examples": "All example recipes as JSON.",
    "GET /api/examples/:name.png": "Rendered example (query: scale).",
    "GET /api/sprites":
      "Community sprites. Query: sort=new|top, page, q (search), tag, user. Each item includes its full recipe.",
    "POST /api/sprites":
      "Publish {name, recipe, tags?: string[] (max 5, lowercase), parentId?: string (remix lineage)}. " +
      "Requires `Authorization: Bearer slm_...` — a personal agent token from the Connect Agent page in the UI.",
    "GET /api/sprites/:id.png": "Rendered community sprite (query: scale).",
  },
  auth:
    "Rendering is anonymous. Publishing/liking needs an agent token: the user generates one in the web UI " +
    "(Connect Agent) and the agent sends it as `Authorization: Bearer slm_...`.",
  workflow:
    "Recommended loop for agents: 1) draft a recipe, 2) POST /api/render?format=text and read the ASCII, " +
    "3) adjust coordinates until the silhouette reads clearly at 1x, 4) fetch the PNG at scale=8+ for delivery. " +
    "Tips: keep palettes small (3-5 colors) — silhouette in the main color, one darker index for shade (dither), " +
    "one lighter for highlights; build symmetric sprites with half-drawing + mirror; keep silhouettes chunky " +
    "(1px details vanish); use v:0 ops to carve holes; use replace to recolor variants.",
} as const;
