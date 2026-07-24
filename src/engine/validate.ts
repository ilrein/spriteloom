import { MAX_COLORS, MAX_OPS, MAX_SIZE, MIN_SIZE, resolvePalette, type Palette, type Recipe } from "./engine";

const OP_NAMES = new Set([
  "px",
  "rect",
  "line",
  "ellipse",
  "fill",
  "mirror",
  "outline",
  "dither",
  "scatter",
  "replace",
  "invert",
  "shift",
  "clear",
]);

const PATTERN_NAMES = new Set(["checker", "sparse", "dense", "hlines", "vlines"]);

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

function isCoordPair(p: unknown): boolean {
  return Array.isArray(p) && p.length === 2 && isInt(p[0]) && isInt(p[1]);
}

function isRegion(r: unknown): boolean {
  if (typeof r !== "object" || r === null) return false;
  const o = r as Record<string, unknown>;
  return isInt(o.x) && isInt(o.y) && isInt(o.w) && isInt(o.h);
}

/**
 * Validate untrusted input against the Recipe shape and the tool's constraints.
 * Returns a list of human-readable errors; empty list means the recipe is valid.
 */
export function validateRecipe(input: unknown): string[] {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null) {
    return ["recipe must be a JSON object"];
  }
  const r = input as Record<string, unknown>;

  if (!isInt(r.size) || r.size < MIN_SIZE || r.size > MAX_SIZE) {
    errors.push(`size must be an integer between ${MIN_SIZE} and ${MAX_SIZE}`);
  }

  if (r.palette !== undefined) {
    if (typeof r.palette !== "object" || r.palette === null) {
      errors.push("palette must be an object");
    } else {
      const p = r.palette as Record<string, unknown>;
      if (p.colors !== undefined) {
        if (
          !Array.isArray(p.colors) ||
          p.colors.length < 2 ||
          p.colors.length > MAX_COLORS ||
          !p.colors.every((c) => typeof c === "string" && HEX_COLOR.test(c))
        ) {
          errors.push(`palette.colors must be 2-${MAX_COLORS} hex colors like "#a0a0a0" (index 0 is the background)`);
        }
      }
      for (const key of ["fg", "bg"] as const) {
        if (p[key] !== undefined && (typeof p[key] !== "string" || !HEX_COLOR.test(p[key] as string))) {
          errors.push(`palette.${key} must be a hex color like "#a0a0a0"`);
        }
      }
      if (p.transparent !== undefined && typeof p.transparent !== "boolean") {
        errors.push("palette.transparent must be a boolean");
      }
    }
  }

  // ops may only write palette indices that exist
  const colorCount = errors.length === 0 || r.palette === undefined
    ? resolvePalette(r.palette as Palette | undefined).colors.length
    : MAX_COLORS;
  const isValidV = (v: unknown): boolean => isInt(v) && v >= 0 && v < colorCount;

  if (!Array.isArray(r.ops)) {
    errors.push("ops must be an array");
    return errors;
  }
  if (r.ops.length > MAX_OPS) {
    errors.push(`ops list too long (${r.ops.length}); max is ${MAX_OPS}`);
  }

  r.ops.forEach((raw, i) => {
    const where = `ops[${i}]`;
    if (typeof raw !== "object" || raw === null) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const o = raw as Record<string, unknown>;
    if (typeof o.op !== "string" || !OP_NAMES.has(o.op)) {
      errors.push(`${where}: unknown op "${String(o.op)}" (valid: ${[...OP_NAMES].join(", ")})`);
      return;
    }
    if (o.v !== undefined && !isValidV(o.v)) {
      errors.push(`${where}: v must be a palette index 0-${colorCount - 1}`);
    }
    switch (o.op) {
      case "px":
        if (!Array.isArray(o.at) || o.at.length === 0 || !o.at.every(isCoordPair)) {
          errors.push(`${where}: px needs "at": [[x,y], ...] with integer coords`);
        }
        break;
      case "rect":
      case "dither":
      case "scatter":
        if (!isInt(o.x) || !isInt(o.y) || !isInt(o.w) || !isInt(o.h)) {
          errors.push(`${where}: ${o.op} needs integer x, y, w, h`);
        }
        if (o.op === "dither" && (typeof o.pattern !== "string" || !PATTERN_NAMES.has(o.pattern))) {
          errors.push(`${where}: dither pattern must be one of ${[...PATTERN_NAMES].join(", ")}`);
        }
        if (o.op === "scatter") {
          if (typeof o.density !== "number" || o.density < 0 || o.density > 1) {
            errors.push(`${where}: scatter density must be a number in [0, 1]`);
          }
          if (o.seed !== undefined && !isInt(o.seed)) {
            errors.push(`${where}: scatter seed must be an integer`);
          }
        }
        if (o.op === "rect" && o.mode !== undefined && o.mode !== "fill" && o.mode !== "stroke") {
          errors.push(`${where}: rect mode must be "fill" or "stroke"`);
        }
        break;
      case "line":
        if (!isCoordPair(o.from) || !isCoordPair(o.to)) {
          errors.push(`${where}: line needs "from": [x,y] and "to": [x,y]`);
        }
        break;
      case "ellipse":
        if (!isInt(o.cx) || !isInt(o.cy) || !isInt(o.rx) || !isInt(o.ry) || (o.rx as number) < 0 || (o.ry as number) < 0) {
          errors.push(`${where}: ellipse needs integer cx, cy and non-negative rx, ry`);
        }
        if (o.mode !== undefined && o.mode !== "fill" && o.mode !== "stroke") {
          errors.push(`${where}: ellipse mode must be "fill" or "stroke"`);
        }
        break;
      case "fill":
        if (!isInt(o.x) || !isInt(o.y)) {
          errors.push(`${where}: fill needs integer x, y`);
        }
        break;
      case "mirror":
        if (o.axis !== "x" && o.axis !== "y") {
          errors.push(`${where}: mirror axis must be "x" (left half onto right) or "y" (top half onto bottom)`);
        }
        break;
      case "shift":
        if (!isInt(o.dx) || !isInt(o.dy)) {
          errors.push(`${where}: shift needs integer dx, dy`);
        }
        if (o.wrap !== undefined && typeof o.wrap !== "boolean") {
          errors.push(`${where}: shift wrap must be a boolean`);
        }
        break;
      case "replace":
        if (!isValidV(o.from) || !isValidV(o.to)) {
          errors.push(`${where}: replace needs "from" and "to" as palette indices 0-${colorCount - 1}`);
        }
        if (o.region !== undefined && !isRegion(o.region)) {
          errors.push(`${where}: region must be {x, y, w, h} with integers`);
        }
        break;
      case "invert":
        if ((o.a !== undefined && !isValidV(o.a)) || (o.b !== undefined && !isValidV(o.b))) {
          errors.push(`${where}: invert a/b must be palette indices 0-${colorCount - 1}`);
        }
        if (o.region !== undefined && !isRegion(o.region)) {
          errors.push(`${where}: region must be {x, y, w, h} with integers`);
        }
        break;
      case "clear":
        if (o.region !== undefined && !isRegion(o.region)) {
          errors.push(`${where}: region must be {x, y, w, h} with integers`);
        }
        break;
      case "outline":
        break;
    }
  });

  return errors;
}

/** Narrow validated input to a Recipe. Call only after validateRecipe returns []. */
export function asRecipe(input: unknown): Recipe {
  return input as Recipe;
}
