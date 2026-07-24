import type { Recipe } from "./engine";

// The brand mark is itself a recipe: a sprite coming off the loom — gray warp
// threads, a gold weft row with the shuttle at the right edge, and a
// just-woven invader below. Rendered everywhere from this one definition
// (sidebar, favicon via /api/logo.png).
export const LOGO: Recipe = {
  name: "spriteloom",
  size: 16,
  palette: { colors: ["#151515", "#707062", "#e8e4d0", "#e0b040"], transparent: true },
  ops: [
    { op: "px", at: [[4, 7]], v: 2 },
    { op: "px", at: [[5, 8]], v: 2 },
    { op: "rect", x: 4, y: 9, w: 4, h: 1, v: 2 },
    { op: "rect", x: 3, y: 10, w: 5, h: 1, v: 2 },
    { op: "px", at: [[5, 10]], v: 0 },
    { op: "rect", x: 2, y: 11, w: 6, h: 1, v: 2 },
    { op: "px", at: [[2, 12]], v: 2 },
    { op: "rect", x: 4, y: 12, w: 4, h: 1, v: 2 },
    { op: "px", at: [[2, 13], [4, 13]], v: 2 },
    { op: "px", at: [[5, 14], [6, 14]], v: 2 },
    { op: "mirror", axis: "x" },
    { op: "rect", x: 3, y: 0, w: 1, h: 5, v: 1 },
    { op: "rect", x: 6, y: 0, w: 1, h: 5, v: 1 },
    { op: "rect", x: 9, y: 0, w: 1, h: 5, v: 1 },
    { op: "rect", x: 12, y: 0, w: 1, h: 5, v: 1 },
    { op: "line", from: [1, 5], to: [14, 5], v: 3 },
    { op: "px", at: [[15, 4], [15, 5], [15, 6]], v: 3 },
  ],
};
