import { useEffect, useRef } from "react";
import { resolvePalette, runRecipe, type Op, type Recipe } from "../../engine/engine";

// The paint surface is an op generator: strokes commit `px` ops, bucket
// clicks commit `fill` ops. The recipe stays the single source of truth —
// the JSON tab shows exactly what painting produced.

export type PaintTool = "pencil" | "fill";

export function PaintCanvas({
  recipe,
  pixel,
  activeV,
  tool,
  onCommit,
}: {
  recipe: Recipe;
  pixel: number;
  activeV: number;
  tool: PaintTool;
  onCommit: (op: Op) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<Map<string, [number, number]>>(new Map());
  const lastCell = useRef<[number, number] | null>(null);
  const painting = useRef(false);

  const { colors, transparent } = resolvePalette(recipe.palette);

  function redraw(): void {
    const canvas = ref.current;
    if (!canvas) return;
    const grid = runRecipe(recipe);
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

  useEffect(redraw, [recipe, pixel, colors, transparent]);

  function cellAt(e: React.PointerEvent): [number, number] | null {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / pixel);
    const y = Math.floor((e.clientY - rect.top) / pixel);
    return x >= 0 && y >= 0 && x < recipe.size && y < recipe.size ? [x, y] : null;
  }

  function paintCell(x: number, y: number): void {
    const key = `${x},${y}`;
    if (stroke.current.has(key)) return;
    stroke.current.set(key, [x, y]);
    const ctx = ref.current!.getContext("2d")!;
    if (activeV === 0) {
      ctx.clearRect(x * pixel, y * pixel, pixel, pixel);
      if (!transparent) {
        ctx.fillStyle = colors[0]!;
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      }
    } else {
      ctx.fillStyle = colors[activeV] ?? "#ff00ff";
      ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
    }
  }

  /** Interpolate between move events so fast drags don't leave gaps. */
  function paintLine(from: [number, number], to: [number, number]): void {
    let [x0, y0] = from;
    const [x1, y1] = to;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      paintCell(x0, y0);
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

  function onPointerDown(e: React.PointerEvent): void {
    const cell = cellAt(e);
    if (!cell) return;
    if (tool === "fill") {
      onCommit({ op: "fill", x: cell[0], y: cell[1], v: activeV });
      return;
    }
    painting.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    stroke.current.clear();
    lastCell.current = cell;
    paintCell(cell[0], cell[1]);
  }

  function onPointerMove(e: React.PointerEvent): void {
    if (!painting.current) return;
    const cell = cellAt(e);
    if (!cell) return;
    if (lastCell.current) paintLine(lastCell.current, cell);
    else paintCell(cell[0], cell[1]);
    lastCell.current = cell;
  }

  function onPointerUp(): void {
    if (!painting.current) return;
    painting.current = false;
    lastCell.current = null;
    const points = [...stroke.current.values()];
    stroke.current.clear();
    if (points.length > 0) {
      onCommit({ op: "px", at: points, v: activeV });
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
