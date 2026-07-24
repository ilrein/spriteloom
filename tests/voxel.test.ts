import { describe, expect, test } from "bun:test";
import { createGrid } from "../src/engine/engine";
import { carve, encodeVox, extrude, inflate, renderIso, vget, voxelsToAscii } from "../src/engine/voxel";
import { encodePngRgba } from "../src/engine/png";

function filledSquare(size: number, from: number, to: number, v = 1) {
  const g = createGrid(size);
  for (let y = from; y <= to; y++) for (let x = from; x <= to; x++) g.data[y * size + x] = v;
  return g;
}

describe("voxelization", () => {
  test("extrude gives uniform depth", () => {
    const g = filledSquare(8, 2, 5);
    const v = extrude(g, 3);
    expect(v.sz).toBe(3);
    expect(vget(v, 3, 3, 0)).toBe(1);
    expect(vget(v, 3, 3, 2)).toBe(1);
    expect(vget(v, 0, 0, 0)).toBe(0);
  });

  test("inflate is thicker in the middle than at the edge", () => {
    const g = filledSquare(16, 2, 13);
    const v = inflate(g, 12);
    const thickness = (x: number, y: number) => {
      let t = 0;
      for (let z = 0; z < v.sz; z++) if (vget(v, x, y, z)) t++;
      return t;
    };
    expect(thickness(8, 8)).toBeGreaterThan(thickness(2, 2));
    expect(thickness(8, 8)).toBeGreaterThan(0);
  });

  test("carve intersects front and side silhouettes", () => {
    const front = filledSquare(8, 0, 7); // full square
    const side = createGrid(8);
    for (let y = 0; y < 8; y++) side.data[y * 8 + 0] = 1; // only z=0 column
    const v = carve(front, side);
    expect(vget(v, 4, 4, 0)).toBe(1);
    expect(vget(v, 4, 4, 1)).toBe(0);
  });

  test("vox export has header and voxel count", () => {
    const v = extrude(filledSquare(8, 3, 4), 2);
    const bytes = encodeVox(v, { colors: ["#000000", "#ff0000"] });
    expect(new TextDecoder("latin1").decode(bytes.slice(0, 4))).toBe("VOX ");
    expect(new TextDecoder("latin1").decode(bytes)).toContain("XYZI");
    expect(new TextDecoder("latin1").decode(bytes)).toContain("RGBA");
    // 2x2 sprite * depth 2 = 8 voxels
    const idx = [...bytes].findIndex((_, i) => bytes[i] === 88 && bytes[i + 1] === 89 && bytes[i + 2] === 90); // XYZ
    const count = bytes[idx + 12]! | (bytes[idx + 13]! << 8);
    expect(count).toBe(8);
  });

  test("iso render produces non-empty RGBA image", async () => {
    const v = extrude(filledSquare(8, 2, 5), 3);
    const img = renderIso(v, { colors: ["#000000", "#cc4444"] });
    expect(img.width).toBeGreaterThan(0);
    let opaque = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(20);
    const png = await encodePngRgba(img.width, img.height, img.data);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  test("ascii slices are readable per z", () => {
    const v = extrude(filledSquare(8, 3, 4), 2);
    const text = voxelsToAscii(v);
    expect(text).toContain("-- z=0 (front)");
    expect(text).toContain("-- z=1");
    expect(text).toContain("##");
  });
});
