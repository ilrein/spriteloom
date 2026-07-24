import { useEffect, useMemo, useRef } from "react";
import {
  applyOp,
  resolvePalette,
  runRecipe,
  type Grid,
  type Op,
  type Recipe,
} from "../../engine/engine";

// The paint surface is an op generator: every gesture commits real recipe ops
// (px for strokes, fill for the bucket, line/rect/ellipse for shape drags).
// Shape previews rasterize the candidate op through the actual engine, so
// what you see during the drag is exactly what the committed op produces.

export type PaintTool = "pencil" | "eraser" | "fill" | "line" | "rect" | "ellipse" | "picker";

type ShapeTool = "line" | "rect" | "ellipse";

const mirrorX = (x: number, size: number) => size - 1 - x;

function mirrorOp(op: Op, size: number): Op | null {
  switch (op.op) {
    case "px":
      return { ...op, at: op.at.map(([x, y]) => [mirrorX(x, size), y] as [number, number]) };
    case "line":
      return { ...op, from: [mirrorX(op.from[0], size), op.from[1]], to: [mirrorX(op.to[0], size), op.to[1]] };
    case "rect":
      return { ...op, x: size - op.x - op.w };
    case "ellipse":
      return { ...op, cx: mirrorX(op.cx, size) };
    case "fill":
      return { ...op, x: mirrorX(op.x, size) };
    default:
      return null;
  }
}

/** Symmetry mode: return the op plus its mirrored twin (merged for px ops). */
function withSymmetry(op: Op, size: number, symmetry: boolean): Op[] {
  if (!symmetry) return [op];
  if (op.op === "px") {
    const seen = new Set(op.at.map(([x, y]) => `${x},${y}`));
    const extra = op.at
      .map(([x, y]) => [mirrorX(x, size), y] as [number, number])
      .filter(([x, y]) => !seen.has(`${x},${y}`));
    return [{ ...op, at: [...op.at, ...extra] }];
  }
  const twin = mirrorOp(op, size);
  return twin && JSON.stringify(twin) !== JSON.stringify(op) ? [op, twin] : [op];
}

function shapeOp(tool: ShapeTool, start: [number, number], end: [number, number], v: number, filled: boolean): Op {
  if (tool === "line") return { op: "line", from: start, to: end, v };
  const x = Math.min(start[0], end[0]);
  const y = Math.min(start[1], end[1]);
  const w = Math.abs(end[0] - start[0]) + 1;
  const h = Math.abs(end[1] - start[1]) + 1;
  if (tool === "rect") return { op: "rect", x, y, w, h, v, mode: filled ? "fill" : "stroke" };
  return {
    op: "ellipse",
    cx: Math.round((start[0] + end[0]) / 2),
    cy: Math.round((start[1] + end[1]) / 2),
    rx: Math.floor(w / 2),
    ry: Math.floor(h / 2),
    v,
    mode: filled ? "fill" : "stroke",
  };
}

export function PaintCanvas({
  recipe,
  pixel,
  activeV,
  tool,
  symmetry,
  showGrid,
  onCommit,
  onPick,
}: {
  recipe: Recipe;
  pixel: number;
  activeV: number;
  tool: PaintTool;
  symmetry: boolean;
  showGrid: boolean;
  onCommit: (ops: Op[]) => void;
  onPick: (v: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Map<string, [number, number]>>(new Map());
  const lastCell = useRef<[number, number] | null>(null);
  const shapeStart = useRef<[number, number] | null>(null);
  const shiftHeld = useRef(false);
  const painting = useRef(false);

  const { colors, transparent } = resolvePalette(recipe.palette);
  const base = useMemo(() => runRecipe(recipe), [recipe]);
  const brush = tool === "eraser" ? 0 : activeV;
  const isShapeTool = tool === "line" || tool === "rect" || tool === "ellipse";

  function draw(grid: Grid): void {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = grid.size * pixel;
    canvas.height = grid.size * pixel;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!transparent) {
      ctx.fillStyle = colors[0]!;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    for (let y = 0; y < grid.size; y++) {
      for (let x = 0; x < grid.size; x++) {
        const v = grid.data[y * grid.size + x]!;
        if (v === 0) continue;
        ctx.fillStyle = colors[v] ?? "#ff00ff";
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      }
    }
    if (showGrid && pixel >= 6) {
      ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
      ctx.lineWidth = 1;
      for (let i = 1; i < grid.size; i++) {
        ctx.beginPath();
        ctx.moveTo(i * pixel + 0.5, 0);
        ctx.lineTo(i * pixel + 0.5, canvas.height);
        ctx.moveTo(0, i * pixel + 0.5);
        ctx.lineTo(canvas.width, i * pixel + 0.5);
        ctx.stroke();
      }
    }
    if (symmetry) {
      ctx.strokeStyle = "rgba(224, 176, 64, 0.55)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo((grid.size / 2) * pixel + 0.5, 0);
      ctx.lineTo((grid.size / 2) * pixel + 0.5, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  useEffect(() => {
    draw(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, pixel, showGrid, symmetry, transparent, colors.join(",")]);

  /** Preview = clone the real grid, run the candidate ops through the engine. */
  function previewOps(ops: Op[]): void {
    const scratch: Grid = { size: base.size, data: base.data.slice() };
    for (const op of ops) applyOp(scratch, op);
    draw(scratch);
  }

  function cellAt(e: React.PointerEvent): [number, number] | null {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / pixel);
    const y = Math.floor((e.clientY - rect.top) / pixel);
    return x >= 0 && y >= 0 && x < recipe.size && y < recipe.size ? [x, y] : null;
  }

  function addStrokeCell(x: number, y: number): void {
    stroke.current.set(`${x},${y}`, [x, y]);
    if (symmetry) {
      const mx = mirrorX(x, recipe.size);
      stroke.current.set(`${mx},${y}`, [mx, y]);
    }
  }

  function addStrokeLine(from: [number, number], to: [number, number]): void {
    let [x0, y0] = from;
    const [x1, y1] = to;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      addStrokeCell(x0, y0);
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

  const strokeOp = (): Op => ({ op: "px", at: [...stroke.current.values()], v: brush });

  function onPointerDown(e: React.PointerEvent): void {
    const cell = cellAt(e);
    if (!cell) return;
    shiftHeld.current = e.shiftKey;

    if (tool === "picker") {
      onPick(base.data[cell[1] * base.size + cell[0]] ?? 0);
      return;
    }
    if (tool === "fill") {
      onCommit(withSymmetry({ op: "fill", x: cell[0], y: cell[1], v: brush }, recipe.size, symmetry));
      return;
    }

    painting.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    lastCell.current = cell;

    if (isShapeTool) {
      shapeStart.current = cell;
      previewOps(withSymmetry(shapeOp(tool as ShapeTool, cell, cell, brush, e.shiftKey), recipe.size, symmetry));
      return;
    }

    stroke.current.clear();
    addStrokeCell(cell[0], cell[1]);
    previewOps([strokeOp()]);
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!painting.current) return;
    const cell = cellAt(e);
    if (!cell) return;
    shiftHeld.current = e.shiftKey;

    if (shapeStart.current) {
      previewOps(
        withSymmetry(shapeOp(tool as ShapeTool, shapeStart.current, cell, brush, e.shiftKey), recipe.size, symmetry),
      );
      lastCell.current = cell;
      return;
    }

    if (lastCell.current) addStrokeLine(lastCell.current, cell);
    else addStrokeCell(cell[0], cell[1]);
    lastCell.current = cell;
    previewOps([strokeOp()]);
  }

  function onPointerUp(): void {
    if (!painting.current) return;
    painting.current = false;

    if (shapeStart.current && lastCell.current) {
      const ops = withSymmetry(
        shapeOp(tool as ShapeTool, shapeStart.current, lastCell.current, brush, shiftHeld.current),
        recipe.size,
        symmetry,
      );
      shapeStart.current = null;
      lastCell.current = null;
      onCommit(ops);
      return;
    }

    lastCell.current = null;
    const points = [...stroke.current.values()];
    stroke.current.clear();
    if (points.length > 0) {
      onCommit([{ op: "px", at: points, v: brush }]);
    }
  }

  return (
    <canvas
      ref={ref}
      className="touch-none cursor-crosshair border-2 pixel-checker"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
