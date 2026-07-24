---
name: spriteloom
description: Generate low-color retro pixel-art sprites (1-bit up to 16 colors, Urizen/Kenney/PICO-8 style) as deterministic JSON recipes rendered via the bitloom API. Use when asked to create pixel art, sprites, tiles, or game icons in a constrained retro style.
---

# spriteloom — low-color sprite foundry

bitloom renders sprites from JSON **recipes** — no image models, pure deterministic
rasterization. A recipe is `{size, palette?, ops[]}` on a `size × size` canvas where
every pixel is a **palette index** (0 = background). Palettes hold 2–16 colors;
ops write the index given by their `v` param (default 1). No gradients, no
anti-aliasing.

Base URL: **https://spriteloom.app** (or the local dev server — `bun run dev`).
Discover everything at runtime: `GET /api/spec` (machine-readable DSL spec) and
`GET /api/examples` (known-good recipes to crib from).

## Workflow (important)

Iterate on ASCII before delivering a PNG — you can *read* your result:

1. Draft a recipe (start from an example with a similar silhouette).
2. `POST /api/render?format=text` — ASCII, one char per pixel by palette index:
   `0 → "."`, `1 → "#"`, `2-15 → "23456789abcdef"`.
3. Adjust coordinates until the silhouette reads clearly at 1×.
4. Deliver: `POST /api/render?scale=8` → PNG (indexed, ~100–300 byte files).

```bash
curl -s -X POST "$BASE/api/render?format=text" \
  -H 'content-type: application/json' \
  -d '{"size":16,"palette":{"colors":["#151515","#7ac74f","#3e7a2e"],"transparent":true},"ops":[{"op":"ellipse","cx":7,"cy":9,"rx":5,"ry":4},{"op":"mirror","axis":"x"},{"op":"dither","x":3,"y":11,"w":10,"h":2,"pattern":"checker","v":2}]}'
```

Validation errors come back as `400 {"errors": [...]}` with exact locations
(`ops[3]: ...`) — fix and retry.

## The op vocabulary

`px` `rect` `line` `ellipse` `fill` (flood) `mirror` `outline` `dither` `scatter`
(seeded) `replace` (recolor from→to) `invert` `shift` `clear` — parameters in
`GET /api/spec`. Constraints: size 8–64, ≤256 ops, `v` must be a valid palette
index (`v:0` erases/carves).

## Style rules for good low-color sprites

- **Silhouette first.** Block the shape with `rect`/`ellipse` fills in the main
  color, then carve with `v:0` and detail with other indices. Never build shapes
  from single pixels.
- **Small palettes read best.** 3–5 colors: main color, one darker index for
  shade, one lighter for highlight. Shade with `dither` in the dark index along
  the bottom/side; highlight with 1–2 `px` in the light index near the top.
- **Symmetry is cheap.** Draw the left half, then `{"op":"mirror","axis":"x"}`.
  On 16×16 the left half is x 0–7. Apply asymmetric details *after* the mirror.
- **Chunky reads, thin vanishes.** Details thinner than 2px disappear at 1×;
  diagonal 2px strokes need offsets of (1,0), not (1,1) (which leaves a checker gap).
- **Texture sparingly.** `dither` for shading regions, `scatter` (seeded,
  deterministic) for organic noise like foliage — density ≤ 0.15.
- **`replace` makes variants.** Same shape, swapped indices → red/blue/green
  potions from one recipe.
- **Transparent bg** (`"transparent": true`) for sprites; opaque for tiles.

## Publishing to the community feed

`POST /api/sprites` with `Authorization: Bearer slm_...` (the user generates a
token on the **Connect agent** page in the web UI). Body:
`{"name": "...", "recipe": {...}, "tags": ["item"], "parentId": null}` —
tags are ≤5 lowercase slugs; `parentId` credits remix lineage. Browse existing
work with `GET /api/sprites?q=...&tag=...` (each item includes its full recipe
— remix by editing it and publishing with `parentId`).

## Output formats

| Query | Returns |
|---|---|
| `?format=text` | ASCII art — for your own inspection loop |
| `?format=json` | `{name, size, palette, rows}` |
| `?scale=N` (format=png, default) | PNG, nearest-neighbor upscaled N× (max output 2048px) |

Recipes are the artifact — save the JSON, not just the PNG. A recipe can be
re-rendered at any scale or repainted via `palette.colors` forever.
