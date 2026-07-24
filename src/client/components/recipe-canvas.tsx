import { useEffect, useRef } from "react";
import { runRecipe, type Recipe } from "../../engine/engine";
import { drawGrid } from "../draw";
import { cn } from "@/lib/utils";

export function RecipeCanvas({
  recipe,
  pixel,
  grid = false,
  className,
  title,
}: {
  recipe: Recipe;
  pixel: number;
  grid?: boolean;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      drawGrid(ref.current, runRecipe(recipe), recipe, pixel, grid);
    } catch {
      // invalid recipes just leave the canvas blank
    }
  }, [recipe, pixel, grid]);

  return <canvas ref={ref} title={title} className={cn("pixel-checker", className)} />;
}
