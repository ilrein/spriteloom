import { describe, expect, test } from "bun:test";
import { createGrid, get, runRecipe, toAscii, type Recipe } from "../src/engine/engine";
import { validateRecipe } from "../src/engine/validate";
import { clampScale, encodePng } from "../src/engine/png";
import { EXAMPLES } from "../src/engine/examples";

describe("engine ops", () => {
  test("rect fill sets exactly the region", () => {
    const g = runRecipe({ size: 8, ops: [{ op: "rect", x: 1, y: 1, w: 2, h: 3 }] });
    expect(get(g, 1, 1)).toBe(1);
    expect(get(g, 2, 3)).toBe(1);
    expect(get(g, 3, 1)).toBe(0);
    expect(g.data.reduce((a, b) => a + b, 0)).toBe(6);
  });

  test("rect clips at canvas edges without wrapping", () => {
    const g = runRecipe({ size: 8, ops: [{ op: "rect", x: 6, y: 6, w: 5, h: 5 }] });
    expect(g.data.reduce((a, b) => a + b, 0)).toBe(4);
  });

  test("mirror x copies left half flipped", () => {
    const g = runRecipe({
      size: 8,
      ops: [
        { op: "px", at: [[1, 2]] },
        { op: "mirror", axis: "x" },
      ],
    });
    expect(get(g, 1, 2)).toBe(1);
    expect(get(g, 6, 2)).toBe(1);
  });

  test("flood fill stays inside boundaries", () => {
    const g = runRecipe({
      size: 8,
      ops: [
        { op: "rect", x: 1, y: 1, w: 6, h: 6, mode: "stroke" },
        { op: "fill", x: 3, y: 3 },
      ],
    });
    expect(get(g, 3, 3)).toBe(1);
    expect(get(g, 0, 0)).toBe(0);
  });

  test("outline wraps a single pixel in a plus shape", () => {
    const g = runRecipe({
      size: 8,
      ops: [
        { op: "px", at: [[3, 3]] },
        { op: "outline" },
      ],
    });
    expect(get(g, 2, 3)).toBe(1);
    expect(get(g, 4, 3)).toBe(1);
    expect(get(g, 3, 2)).toBe(1);
    expect(get(g, 3, 4)).toBe(1);
    expect(get(g, 2, 2)).toBe(0);
  });

  test("scatter is deterministic for a given seed", () => {
    const recipe: Recipe = {
      size: 16,
      ops: [{ op: "scatter", x: 0, y: 0, w: 16, h: 16, density: 0.5, seed: 42 }],
    };
    expect(toAscii(runRecipe(recipe))).toBe(toAscii(runRecipe(recipe)));
  });

  test("ops write palette indices and ascii maps them to digits", () => {
    const g = runRecipe({
      size: 8,
      palette: { colors: ["#000000", "#ffffff", "#ff0000", "#00ff00"] },
      ops: [
        { op: "rect", x: 0, y: 0, w: 2, h: 1, v: 2 },
        { op: "px", at: [[2, 0]], v: 3 },
      ],
    });
    expect(get(g, 0, 0)).toBe(2);
    expect(toAscii(g).split("\n")[0]).toBe("223.....");
  });

  test("replace recolors matching pixels only", () => {
    const g = runRecipe({
      size: 8,
      palette: { colors: ["#000000", "#ffffff", "#ff0000"] },
      ops: [
        { op: "rect", x: 0, y: 0, w: 4, h: 4, v: 1 },
        { op: "px", at: [[0, 0]], v: 2 },
        { op: "replace", from: 1, to: 2, region: { x: 0, y: 0, w: 2, h: 2 } },
      ],
    });
    expect(get(g, 0, 0)).toBe(2);
    expect(get(g, 1, 1)).toBe(2);
    expect(get(g, 3, 3)).toBe(1);
  });

  test("shift with wrap moves pixels around edges", () => {
    const g = runRecipe({
      size: 8,
      ops: [
        { op: "px", at: [[0, 0]] },
        { op: "shift", dx: -1, dy: 0, wrap: true },
      ],
    });
    expect(get(g, 7, 0)).toBe(1);
    expect(get(g, 0, 0)).toBe(0);
  });
});

describe("validate", () => {
  test("accepts every example", () => {
    for (const recipe of EXAMPLES) {
      expect(validateRecipe(recipe)).toEqual([]);
    }
  });

  test("rejects bad size, unknown op, bad params", () => {
    expect(validateRecipe({ size: 4, ops: [] }).length).toBe(1);
    expect(validateRecipe({ size: 16, ops: [{ op: "blur" }] })[0]).toContain("unknown op");
    expect(validateRecipe({ size: 16, ops: [{ op: "rect", x: 0.5, y: 0, w: 2, h: 2 }] })[0]).toContain("integer");
    expect(validateRecipe({ size: 16, ops: [{ op: "scatter", x: 0, y: 0, w: 4, h: 4, density: 2 }] })[0]).toContain(
      "density",
    );
  });

  test("rejects non-object input", () => {
    expect(validateRecipe("nope").length).toBe(1);
    expect(validateRecipe(null).length).toBe(1);
  });

  test("v must be a valid palette index", () => {
    expect(validateRecipe({ size: 8, ops: [{ op: "px", at: [[0, 0]], v: 3 }] })[0]).toContain("palette index");
    expect(
      validateRecipe({
        size: 8,
        palette: { colors: ["#000000", "#ffffff", "#ff0000", "#00ff00"] },
        ops: [{ op: "px", at: [[0, 0]], v: 3 }],
      }),
    ).toEqual([]);
    expect(
      validateRecipe({
        size: 8,
        palette: { colors: ["#000000", "#ffffff", "#ff0000", "#00ff00"] },
        ops: [{ op: "px", at: [[0, 0]], v: 4 }],
      })[0],
    ).toContain("palette index");
  });

  test("palette.colors shape is validated", () => {
    expect(validateRecipe({ size: 8, palette: { colors: ["#000000"] }, ops: [] })[0]).toContain("palette.colors");
    expect(validateRecipe({ size: 8, palette: { colors: ["#000", "#fff"] }, ops: [] })[0]).toContain("palette.colors");
  });
});

describe("png", () => {
  test("encodes a valid PNG with signature, IHDR, PLTE, IEND", async () => {
    const g = createGrid(16);
    g.data[0] = 1;
    const bytes = await encodePng(g, { fg: "#ffffff", bg: "#000000" }, 4);
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(16)).toBe(64); // width = 16 * scale 4
    expect(view.getUint32(20)).toBe(64);
    const tail = new TextDecoder("latin1").decode(bytes.slice(-8));
    expect(tail).toContain("IEND");
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 64));
    expect(head).toContain("IHDR");
    expect(head).toContain("PLTE");
  });

  test("transparent palette adds tRNS chunk", async () => {
    const g = createGrid(8);
    const bytes = await encodePng(g, { transparent: true });
    expect(new TextDecoder("latin1").decode(bytes)).toContain("tRNS");
  });

  test("bit depth follows palette size", async () => {
    const g = createGrid(8);
    const depthByte = (bytes: Uint8Array) => bytes[24];
    expect(depthByte(await encodePng(g, { colors: ["#000000", "#ffffff"] }))).toBe(1);
    expect(depthByte(await encodePng(g, { colors: ["#000000", "#ffffff", "#ff0000"] }))).toBe(2);
    expect(depthByte(await encodePng(g, { colors: ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"] }))).toBe(4);
  });

  test("clampScale caps output dimensions", () => {
    expect(clampScale(16, 8)).toBe(8);
    expect(clampScale(64, 32)).toBe(32);
    expect(clampScale(64, 1000)).toBe(32);
    expect(clampScale(16, 0)).toBe(1);
  });
});
