import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  Brush,
  Circle,
  Download,
  Eraser,
  FlipHorizontal2,
  Grid3x3,
  PaintBucket,
  Pipette,
  Redo2,
  Slash,
  Square,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  MAX_COLORS,
  resolvePalette,
  runRecipe,
  toAscii,
  type Op,
  type Recipe,
} from "../../engine/engine";
import { encodePng } from "../../engine/png";
import { EXAMPLES } from "../../engine/examples";
import { asRecipe, validateRecipe } from "../../engine/validate";
import { Api } from "../api";
import { encodeVox, spriteToVoxels } from "../../engine/voxel";
import { IsoPreview } from "../components/iso-preview";
import { PaintCanvas, type PaintTool } from "../components/paint-canvas";
import { RecipeCanvas } from "../components/recipe-canvas";
import { Tip } from "../components/tip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

function parseSource(text: string): { recipe: Recipe | null; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { recipe: null, errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const errors = validateRecipe(parsed);
  return errors.length > 0 ? { recipe: null, errors } : { recipe: asRecipe(parsed), errors: [] };
}

const TOOLS: { id: PaintTool; icon: typeof Brush; label: string; key: string }[] = [
  { id: "pencil", icon: Brush, label: "pencil", key: "b" },
  { id: "eraser", icon: Eraser, label: "eraser", key: "e" },
  { id: "fill", icon: PaintBucket, label: "bucket fill", key: "g" },
  { id: "line", icon: Slash, label: "line (drag)", key: "l" },
  { id: "rect", icon: Square, label: "rectangle (drag; hold shift to fill)", key: "r" },
  { id: "ellipse", icon: Circle, label: "ellipse (drag; hold shift to fill)", key: "o" },
  { id: "picker", icon: Pipette, label: "eyedropper", key: "i" },
];

export function ForgeView({
  source,
  onSourceChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  tags,
  onTagsChange,
  remixParentId,
  onPublished,
  signedIn,
  onNeedAuth,
}: {
  source: string;
  onSourceChange: (text: string, opts?: { coalesce?: boolean }) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  tags: string;
  onTagsChange: (tags: string) => void;
  remixParentId: string | null;
  onPublished: () => void;
  signedIn: boolean;
  onNeedAuth: () => void;
}) {
  const [mode, setMode] = useState<"paint" | "json">("paint");
  const [tool, setTool] = useState<PaintTool>("pencil");
  const [activeV, setActiveV] = useState(1);
  const [symmetry, setSymmetry] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(0);
  const [newSize, setNewSize] = useState("16");
  const [showAscii, setShowAscii] = useState(false);
  const [exportScale, setExportScale] = useState("8");
  const [voxelMode, setVoxelMode] = useState<"extrude" | "inflate">("inflate");
  const [voxelDepth, setVoxelDepth] = useState("5");
  const [status, setStatus] = useState<string | null>(null);

  const { recipe, errors } = useMemo(() => parseSource(source), [source]);
  const palette = recipe ? resolvePalette(recipe.palette) : null;
  const brush = palette ? Math.min(activeV, palette.colors.length - 1) : 1;
  const pixel = recipe
    ? Math.max(4, Math.min(40, Math.floor(416 / recipe.size) + zoom * 2))
    : 16;

  function updateRecipe(mutate: (r: Recipe) => void): void {
    if (!recipe) return;
    const next = structuredClone(recipe);
    mutate(next);
    onSourceChange(JSON.stringify(next, null, 2));
  }

  const commitOps = (ops: Op[]) => updateRecipe((r) => r.ops.push(...ops));

  // Aseprite-style single-key shortcuts (skipped while typing in a field)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (typing && target.tagName === "TEXTAREA") return; // native textarea undo
        e.preventDefault();
        if (e.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const toolFor = TOOLS.find((t) => t.key === e.key.toLowerCase());
      if (toolFor) {
        setTool(toolFor.id);
        setMode("paint");
      } else if (e.key.toLowerCase() === "x") {
        setSymmetry((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo]);

  function newSprite(): void {
    onSourceChange(
      JSON.stringify(
        {
          name: "untitled",
          size: Number(newSize),
          palette: recipe?.palette ?? { colors: ["#151515", "#e0e0cc"], transparent: true },
          ops: [],
        },
        null,
        2,
      ),
    );
  }

  async function downloadPng() {
    if (!recipe) return;
    const bytes = await encodePng(runRecipe(recipe), recipe.palette, Number(exportScale));
    const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${recipe.name ?? "sprite"}@${exportScale}x.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function publish() {
    if (!recipe) return;
    if (!signedIn) {
      onNeedAuth();
      return;
    }
    const tagList = tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    try {
      await Api.publish(recipe.name?.trim() || "untitled", recipe, tagList, remixParentId);
      onPublished(); // navigates to the feed — the new sprite is the first card
    } catch (err) {
      setStatus(`publish failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setStatus(null), 6000);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 tracking-[0.3em]">
            EDITOR
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant={mode === "paint" ? "default" : "outline"} onClick={() => setMode("paint")}>
                <Brush className="size-3.5" /> paint
              </Button>
              <Button size="sm" variant={mode === "json" ? "default" : "outline"} onClick={() => setMode("json")}>
                <Braces className="size-3.5" /> json
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {remixParentId && (
            <p className="text-xs text-muted-foreground">remixing {remixParentId} — publish to credit the lineage</p>
          )}

          {mode === "paint" ? (
            recipe && palette ? (
              <>
                <div className="flex flex-wrap items-center gap-1">
                  {TOOLS.map(({ id, icon: Icon, label, key }) => (
                    <Tip key={id} label={`${label} (${key})`}>
                      <Button
                        size="icon-sm"
                        variant={tool === id ? "default" : "outline"}
                        onClick={() => setTool(id)}
                        aria-label={label}
                      >
                        <Icon className="size-4" />
                      </Button>
                    </Tip>
                  ))}
                  <span className="mx-1 h-6 border-l-2" />
                  <Tip label="mirror symmetry (x)">
                    <Button
                      size="icon-sm"
                      variant={symmetry ? "default" : "outline"}
                      onClick={() => setSymmetry(!symmetry)}
                      aria-label="mirror symmetry"
                    >
                      <FlipHorizontal2 className="size-4" />
                    </Button>
                  </Tip>
                  <Tip label="toggle grid">
                    <Button
                      size="icon-sm"
                      variant={showGrid ? "default" : "outline"}
                      onClick={() => setShowGrid(!showGrid)}
                      aria-label="toggle grid"
                    >
                      <Grid3x3 className="size-4" />
                    </Button>
                  </Tip>
                  <span className="mx-1 h-6 border-l-2" />
                  <Tip label="zoom out">
                    <Button size="icon-sm" variant="outline" onClick={() => setZoom((z) => z - 1)} aria-label="zoom out">
                      <ZoomOut className="size-4" />
                    </Button>
                  </Tip>
                  <Tip label="zoom in">
                    <Button size="icon-sm" variant="outline" onClick={() => setZoom((z) => z + 1)} aria-label="zoom in">
                      <ZoomIn className="size-4" />
                    </Button>
                  </Tip>
                  <span className="ml-auto flex gap-1">
                    <Tip label="undo (⌘z)">
                      <Button size="icon-sm" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label="undo">
                        <Undo2 className="size-4" />
                      </Button>
                    </Tip>
                    <Tip label="redo (⌘⇧z)">
                      <Button size="icon-sm" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label="redo">
                        <Redo2 className="size-4" />
                      </Button>
                    </Tip>
                    <Tip label="clear all ops">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => updateRecipe((r) => void (r.ops = []))}
                        disabled={recipe.ops.length === 0}
                        aria-label="clear all ops"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </Tip>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <span className="mr-1 text-xs tracking-[0.3em] text-muted-foreground">INK</span>
                  {palette.colors.map((color, i) => (
                    <Tip key={i} label={i === 0 ? "index 0 — background (erases)" : `paint with index ${i}`}>
                      <button
                        onClick={() => {
                          setActiveV(i);
                          if (tool === "eraser") setTool("pencil");
                        }}
                        aria-label={i === 0 ? "background ink" : `ink ${i}`}
                        className={cn(
                          "size-7 border-2",
                          i === 0 && "pixel-checker",
                          brush === i && tool !== "eraser" ? "border-ring ring-2 ring-ring" : "border-input",
                        )}
                        style={i === 0 ? undefined : { background: color }}
                      />
                    </Tip>
                  ))}
                </div>

                <div className="overflow-auto">
                  <PaintCanvas
                    recipe={recipe}
                    pixel={pixel}
                    activeV={brush}
                    tool={tool}
                    symmetry={symmetry}
                    showGrid={showGrid}
                    onCommit={commitOps}
                    onPick={(v) => {
                      setActiveV(v);
                      setTool(v === 0 ? "eraser" : "pencil");
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    b/e/g/l/r/o/i tools · x symmetry · shift = filled shapes — every gesture appends an op (see{" "}
                    <b>json</b>)
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    new:
                    <Select value={newSize} onValueChange={setNewSize}>
                      <SelectTrigger size="sm" className="w-18">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["8", "12", "16", "24", "32", "48", "64"].map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={newSprite}>
                      blank
                    </Button>
                  </span>
                </div>
              </>
            ) : (
              <pre className="whitespace-pre-wrap border-2 border-destructive p-2 text-xs text-destructive">
                {`recipe is invalid — fix it in the json tab first\n\n${errors.join("\n")}`}
              </pre>
            )
          ) : (
            <>
              <textarea
                value={source}
                onChange={(e) => onSourceChange(e.target.value, { coalesce: true })}
                spellCheck={false}
                rows={22}
                className="w-full border-2 border-input bg-black/40 p-3 font-mono text-xs leading-relaxed outline-none focus:border-ring"
              />
              {errors.length > 0 && (
                <pre className="whitespace-pre-wrap border-2 border-destructive p-2 text-xs text-destructive">
                  {errors.join("\n")}
                </pre>
              )}
              <p className="text-xs text-muted-foreground">
                ops: px rect line ellipse fill mirror outline dither scatter replace invert shift clear —{" "}
                <a className="underline" href="/api/spec" target="_blank" rel="noreferrer">
                  full spec
                </a>{" "}
                · agents connect via the sidebar
              </p>
            </>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t-2 pt-3">
            <div className="grid gap-1">
              <Label htmlFor="sprite-name" className="text-xs text-muted-foreground">
                name
              </Label>
              <Input
                id="sprite-name"
                value={recipe?.name ?? ""}
                onChange={(e) => updateRecipe((r) => void (r.name = e.target.value))}
                placeholder="untitled"
                className="w-40"
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="tags" className="text-xs text-muted-foreground">
                tags (comma separated)
              </Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => onTagsChange(e.target.value)}
                placeholder="item, weapon"
                className="w-48"
              />
            </div>
            <Button onClick={() => void publish()} disabled={!recipe}>
              <Upload className="size-4" /> PUBLISH
            </Button>
          </div>
          {status && <p className="border-2 p-2 text-xs">{status}</p>}
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 tracking-[0.3em]">
            PREVIEW
            <Select
              onValueChange={(name) => {
                const example = EXAMPLES.find((e) => e.name === name);
                if (example) onSourceChange(JSON.stringify(example, null, 2));
              }}
            >
              <SelectTrigger size="sm" className="ml-auto w-32 font-normal tracking-normal">
                <SelectValue placeholder="load…" />
              </SelectTrigger>
              <SelectContent>
                {EXAMPLES.map((e) => (
                  <SelectItem key={e.name} value={e.name!}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {recipe && (
            <div className="flex items-end gap-3">
              <RecipeCanvas recipe={recipe} pixel={Math.max(2, Math.floor(128 / recipe.size))} className="border-2" />
              <RecipeCanvas recipe={recipe} pixel={2} className="border" />
              <RecipeCanvas recipe={recipe} pixel={1} className="border" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={showAscii} onChange={(e) => setShowAscii(e.target.checked)} /> ascii
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={palette?.transparent ?? false}
                onChange={(e) =>
                  updateRecipe((r) => {
                    r.palette = { colors: resolvePalette(r.palette).colors, transparent: e.target.checked };
                  })
                }
              />{" "}
              transparent
            </label>
          </div>

          {palette && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tracking-[0.3em] text-muted-foreground">PALETTE</span>
              {palette.colors.map((color, i) => (
                <span key={i} className="flex flex-col items-center gap-0.5">
                  <input
                    type="color"
                    value={color}
                    title={i === 0 ? "0 (background)" : String(i)}
                    onChange={(e) =>
                      updateRecipe((r) => {
                        const colors = [...resolvePalette(r.palette).colors];
                        colors[i] = e.target.value;
                        r.palette = { colors, transparent: palette.transparent };
                      })
                    }
                    className="size-7 cursor-pointer border-2 border-input bg-transparent p-0"
                  />
                  <span className="text-[10px] text-muted-foreground">{i}</span>
                </span>
              ))}
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="add color"
                disabled={palette.colors.length >= MAX_COLORS}
                onClick={() =>
                  updateRecipe((r) => {
                    r.palette = {
                      colors: [...resolvePalette(r.palette).colors, "#888888"],
                      transparent: palette.transparent,
                    };
                  })
                }
              >
                +
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                aria-label="remove color"
                disabled={palette.colors.length <= 2}
                onClick={() =>
                  updateRecipe((r) => {
                    r.palette = {
                      colors: resolvePalette(r.palette).colors.slice(0, -1),
                      transparent: palette.transparent,
                    };
                  })
                }
              >
                −
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select value={exportScale} onValueChange={setExportScale}>
              <SelectTrigger size="sm" className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["1", "4", "8", "16", "32"].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}x
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void downloadPng()} disabled={!recipe}>
              <Download className="size-4" /> PNG
            </Button>
            <Button variant="ghost" onClick={() => void navigator.clipboard.writeText(source)} disabled={!recipe}>
              copy json
            </Button>
          </div>

          {showAscii && recipe && (
            <pre className="border-2 border-input p-2 text-[10px] leading-none tracking-[2px] text-muted-foreground">
              {toAscii(runRecipe(recipe))}
            </pre>
          )}

          {recipe && (
            <div className="flex flex-col gap-2 border-t-2 pt-3">
              <span className="text-xs tracking-[0.3em] text-muted-foreground">3D</span>
              <IsoPreview recipe={recipe} mode={voxelMode} depth={Number(voxelDepth)} className="self-start" />
              <div className="flex flex-wrap items-center gap-2">
                <Select value={voxelMode} onValueChange={(v) => setVoxelMode(v as "extrude" | "inflate")}>
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflate">inflate</SelectItem>
                    <SelectItem value="extrude">extrude</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={voxelDepth} onValueChange={setVoxelDepth}>
                  <SelectTrigger size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["3", "4", "5", "6", "8", "10"].map((d) => (
                      <SelectItem key={d} value={d}>
                        depth {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!recipe) return;
                    const voxels = spriteToVoxels(recipe, voxelMode, Number(voxelDepth));
                    const bytes = encodeVox(voxels, recipe.palette);
                    const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `${recipe.name ?? "sprite"}.vox`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download className="size-4" /> .vox
                </Button>
                <span className="text-xs text-muted-foreground">opens in MagicaVoxel</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
