import { useEffect, useRef } from "react";
import type { Recipe } from "../../engine/engine";
import { renderIso, scaleRgba, spriteToVoxels, type VoxelMode } from "../../engine/voxel";

/** Client-side isometric voxel preview — same renderer the API uses. */
export function IsoPreview({
  recipe,
  mode,
  depth,
  maxWidth = 200,
  className,
}: {
  recipe: Recipe;
  mode: Exclude<VoxelMode, "carve">;
  depth: number;
  maxWidth?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      const voxels = spriteToVoxels(recipe, mode, depth);
      const raw = renderIso(voxels, recipe.palette);
      const scale = Math.max(1, Math.floor(maxWidth / raw.width));
      const img = scaleRgba(raw, scale);
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    } catch {
      /* invalid recipes render nothing */
    }
  }, [recipe, mode, depth, maxWidth]);

  return <canvas ref={ref} className={className} />;
}
