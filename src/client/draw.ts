import { resolvePalette, type Grid, type Recipe } from "../engine/engine";

export function drawGrid(
  canvas: HTMLCanvasElement,
  grid: Grid,
  recipe: Recipe,
  scale: number,
  showGrid: boolean,
): void {
  canvas.width = grid.size * scale;
  canvas.height = grid.size * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { colors, transparent } = resolvePalette(recipe.palette);
  if (!transparent) {
    ctx.fillStyle = colors[0]!;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      const v = grid.data[y * grid.size + x]!;
      if (v === 0) continue;
      // out-of-range indices render magenta so mistakes are visible, not silent
      ctx.fillStyle = colors[v] ?? "#ff00ff";
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  if (showGrid && scale >= 6) {
    ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
    ctx.lineWidth = 1;
    for (let i = 1; i < grid.size; i++) {
      ctx.beginPath();
      ctx.moveTo(i * scale + 0.5, 0);
      ctx.lineTo(i * scale + 0.5, canvas.height);
      ctx.moveTo(0, i * scale + 0.5);
      ctx.lineTo(canvas.width, i * scale + 0.5);
      ctx.stroke();
    }
  }
}
