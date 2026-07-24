import { useMemo, useState } from "react";
import { Braces, Brush, Download, PaintBucket, Trash2, Undo2, Upload } from "lucide-react";
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
import { PaintCanvas, type PaintTool } from "../components/paint-canvas";
import { RecipeCanvas } from "../components/recipe-canvas";
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

export function ForgeView({
  source,
  onSourceChange,
  remixParentId,
  onPublished,
  signedIn,
  onNeedAuth,
}: {
  source: string;
  onSourceChange: (text: string) => void;
  remixParentId: string | null;
  onPublished: () => void;
  signedIn: boolean;
  onNeedAuth: () => void;
}) {
  const [mode, setMode] = useState<"paint" | "json">("paint");
  const [tool, setTool] = useState<PaintTool>("pencil");
  const [activeV, setActiveV] = useState(1);
  const [newSize, setNewSize] = useState("16");
  const [showAscii, setShowAscii] = useState(false);
  const [exportScale, setExportScale] = useState("8");
  const [tagsText, setTagsText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const { recipe, errors } = useMemo(() => parseSource(source), [source]);
  const palette = recipe ? resolvePalette(recipe.palette) : null;
  const brush = palette ? Math.min(activeV, palette.colors.length - 1) : 1;

  function updateRecipe(mutate: (r: Recipe) => void): void {
    if (!recipe) return;
    const next = structuredClone(recipe);
    mutate(next);
    onSourceChange(JSON.stringify(next, null, 2));
  }

  const commitOp = (op: Op) => updateRecipe((r) => r.ops.push(op));

  function newSprite(): void {
    const size = Number(newSize);
    onSourceChange(
      JSON.stringify(
        {
          name: "untitled",
          size,
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
    const tags = tagsText
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    try {
      await Api.publish(recipe.name?.trim() || "untitled", recipe, tags, remixParentId);
      setStatus(`published "${recipe.name ?? "untitled"}" — see Sprites`);
      setTimeout(() => setStatus(null), 4000);
      onPublished();
    } catch (err) {
      setStatus(`publish failed: ${err instanceof Error ? err.message : String(err)}`);
      setTimeout(() => setStatus(null), 6000);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant={tool === "pencil" ? "default" : "outline"}
                    onClick={() => setTool("pencil")}
                    aria-label="pencil"
                    title="pencil — index 0 erases"
                  >
                    <Brush className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant={tool === "fill" ? "default" : "outline"}
                    onClick={() => setTool("fill")}
                    aria-label="flood fill"
                    title="flood fill"
                  >
                    <PaintBucket className="size-4" />
                  </Button>
                  <span className="mx-1 flex items-center gap-1">
                    {palette.colors.map((color, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveV(i)}
                        title={i === 0 ? "0 — background (eraser)" : `paint with index ${i}`}
                        className={cn(
                          "size-7 border-2",
                          i === 0 && "pixel-checker",
                          brush === i ? "border-ring ring-2 ring-ring" : "border-input",
                        )}
                        style={i === 0 ? undefined : { background: color }}
                      />
                    ))}
                  </span>
                  <span className="ml-auto flex gap-1">
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => updateRecipe((r) => void r.ops.pop())}
                      disabled={recipe.ops.length === 0}
                      aria-label="undo last op"
                      title="undo last op"
                    >
                      <Undo2 className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => updateRecipe((r) => void (r.ops = []))}
                      disabled={recipe.ops.length === 0}
                      aria-label="clear all ops"
                      title="clear all ops"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>

                <PaintCanvas
                  recipe={recipe}
                  pixel={Math.max(6, Math.min(26, Math.floor(416 / recipe.size)))}
                  activeV={brush}
                  tool={tool}
                  onCommit={commitOp}
                />

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    every stroke appends an op to the recipe — open <b>json</b> to watch
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
                onChange={(e) => onSourceChange(e.target.value)}
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
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
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
            <RecipeCanvas
              recipe={recipe}
              pixel={Math.max(2, Math.floor(160 / recipe.size))}
              className="self-start border-2"
            />
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
        </CardContent>
      </Card>
    </div>
  );
}
