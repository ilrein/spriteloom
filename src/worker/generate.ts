// The loombot: themed sprite generation on a schedule. Picks a biome theme,
// asks Workers AI for recipes (with the DSL spec and few-shot examples in the
// prompt), validates and quality-gates every candidate through the real
// engine, and publishes survivors under @loombot with theme tags.

import { runRecipe, type Recipe } from "../engine/engine";
import { validateRecipe, asRecipe } from "../engine/validate";

export const LOOMBOT_USER_ID = "seed-user-loombot";
const MODEL = "@cf/moonshotai/kimi-k2.7-code";
const AI_GATEWAY = "spriteloom";
const BATCH_TARGET = 6;

const THEMES = [
  { theme: "swamp", palette: ["#151515", "#5a7a3a", "#8fae5a", "#3a4a2a", "#a8794a"] },
  { theme: "crypt", palette: ["#151515", "#8a8aa0", "#c8c8dc", "#4a4a5e", "#7ac74f"] },
  { theme: "arctic", palette: ["#151515", "#c8e0ec", "#8ab8d0", "#ffffff", "#5a7a94"] },
  { theme: "desert", palette: ["#151515", "#e0c078", "#b8945a", "#8a6239", "#d04848"] },
  { theme: "volcano", palette: ["#151515", "#d04828", "#e8a030", "#5a3a3a", "#2a2a2a"] },
  { theme: "abyss", palette: ["#151515", "#3a4a8a", "#5a7ad0", "#28304e", "#7ae0c8"] },
  { theme: "meadow", palette: ["#151515", "#7ac74f", "#e8d060", "#d078a8", "#5a9e3a"] },
  { theme: "ruins", palette: ["#151515", "#9a9a8e", "#6e6e64", "#7a9e5a", "#c8b878"] },
  { theme: "cavern", palette: ["#151515", "#7a6a8a", "#a890c0", "#4a3e5a", "#e0b040"] },
  { theme: "harbor", palette: ["#151515", "#5a8ab0", "#c8b878", "#8a6239", "#dce4e8"] },
] as const;

const SUBJECTS = [
  "a creature", "an item", "a weapon or tool", "a plant or natural feature",
  "a terrain tile (opaque background)", "a piece of furniture or structure",
];

function prompt(theme: string, palette: readonly string[]): string {
  return `You are a pixel artist producing sprites for spriteloom, a low-color sprite tool.
A sprite is a JSON recipe: {"name","size":16,"palette":{"colors":[...],"transparent":true},"ops":[...]}.
Every pixel is a palette index (0 = background). Ops apply in order; "v" is the palette index to write (default 1).

Ops (exact params):
- {"op":"px","at":[[x,y],...],"v":1}
- {"op":"rect","x":0,"y":0,"w":4,"h":4,"v":1,"mode":"fill"|"stroke"}
- {"op":"line","from":[x,y],"to":[x,y],"v":1}
- {"op":"ellipse","cx":7,"cy":7,"rx":4,"ry":3,"v":1,"mode":"fill"|"stroke"}
- {"op":"fill","x":1,"y":1,"v":1}  (flood fill)
- {"op":"mirror","axis":"x"}  (copies left half onto right — draw the left half first, then mirror)
- {"op":"outline","v":1}
- {"op":"dither","x":0,"y":8,"w":16,"h":8,"pattern":"checker"|"sparse"|"dense","v":2}
- {"op":"scatter","x":0,"y":0,"w":16,"h":16,"density":0.1,"seed":7,"v":2}

Craft rules: silhouette first with rect/ellipse fills; carve details with v:0; shade with dither in a darker
index; use mirror for symmetric subjects; details thinner than 2px vanish. Coordinates are 0-15.

Example (a slime):
{"name":"slime","size":16,"palette":{"colors":["#151515","#7ac74f","#3e7a2e"],"transparent":true},"ops":[{"op":"ellipse","cx":7,"cy":10,"rx":6,"ry":4},{"op":"ellipse","cx":7,"cy":7,"rx":4,"ry":3},{"op":"mirror","axis":"x"},{"op":"rect","x":3,"y":12,"w":10,"h":2},{"op":"clear","region":{"x":0,"y":14,"w":16,"h":2}},{"op":"dither","x":3,"y":12,"w":10,"h":2,"pattern":"checker","v":2},{"op":"px","at":[[5,8],[5,9],[10,8],[10,9]],"v":2},{"op":"px","at":[[7,11],[8,11]],"v":2}]}

Task: create ${BATCH_TARGET} distinct 16x16 sprites for the theme "${theme}".
Cover different subjects: ${SUBJECTS.join("; ")}.
Suggested theme palette (adapt freely, 3-5 colors, index 0 stays "#151515"): ${JSON.stringify(palette)}.
Terrain tiles should use "transparent":false and fill the canvas; everything else "transparent":true.
Give each sprite 2-3 lowercase tags (single words, e.g. "creature","tile","plant" — do NOT include "${theme}").

Respond with ONLY a JSON object, no prose: {"sprites":[{"name":"...","tags":["..."],"recipe":{...}},...]}`;
}

interface AiBinding {
  run(
    model: string,
    options: Record<string, unknown>,
    config?: { gateway?: { id: string; skipCache?: boolean; metadata?: Record<string, string> } },
  ): Promise<unknown>;
}

/** Route through the spriteloom AI Gateway (analytics/logs/rate control);
 *  fall back to direct Workers AI if the gateway doesn't exist yet. */
async function runModel(ai: AiBinding, options: Record<string, unknown>): Promise<unknown> {
  try {
    return await ai.run(MODEL, options, {
      gateway: { id: AI_GATEWAY, skipCache: true, metadata: { app: "spriteloom", job: "loombot" } },
    });
  } catch (err) {
    console.warn(
      `AI Gateway "${AI_GATEWAY}" unavailable (${err instanceof Error ? err.message : String(err)}) — using direct Workers AI`,
    );
    return ai.run(MODEL, options);
  }
}

interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown> };
  };
  batch(statements: unknown[]): Promise<unknown[]>;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in model output");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { sprites: salvageSprites(raw) };
  }
}

/**
 * Salvage complete objects from a possibly truncated/corrupt sprites array:
 * bracket-match each top-level object after "sprites": [ and parse them
 * individually, keeping the survivors.
 */
function salvageSprites(raw: string): unknown[] {
  const anchor = raw.indexOf('"sprites"');
  const arrayStart = anchor === -1 ? -1 : raw.indexOf("[", anchor);
  if (arrayStart === -1) return [];
  const out: unknown[] = [];
  let i = arrayStart + 1;
  while (i < raw.length) {
    while (i < raw.length && raw[i] !== "{" && raw[i] !== "]") i++;
    if (i >= raw.length || raw[i] === "]") break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    const objStart = i;
    let objEnd = -1;
    for (; i < raw.length; i++) {
      const ch = raw[i]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i;
          break;
        }
      }
    }
    if (objEnd === -1) break; // truncated mid-object — stop
    try {
      out.push(JSON.parse(raw.slice(objStart, objEnd + 1)));
    } catch {
      /* skip malformed object, keep scanning */
    }
    i = objEnd + 1;
  }
  return out;
}

function aiText(result: unknown): string {
  const r = result as Record<string, unknown>;
  if (typeof r.response === "string" && r.response.length > 0) return r.response;
  const output = r.output as { content?: { text?: string }[] }[] | undefined;
  if (Array.isArray(output)) {
    const texts = output.flatMap((o) => o.content ?? []).map((c) => c.text ?? "");
    if (texts.join("").length > 0) return texts.join("");
  }
  const choices = r.choices as { message?: { content?: string }; finish_reason?: string }[] | undefined;
  if (choices?.[0]?.message?.content) return choices[0].message.content;
  if (choices?.[0]) {
    throw new Error(
      `model returned empty content (finish_reason=${choices[0].finish_reason ?? "?"}) — likely max_tokens exhausted by reasoning`,
    );
  }
  return JSON.stringify(result);
}

export interface GenerationReport {
  theme: string;
  published: { id: string; name: string; tags: string[] }[];
  rejected: { name: string; reason: string }[];
}

export async function generateBatch(ai: AiBinding, db: D1Like): Promise<GenerationReport> {
  const pick = THEMES[Math.floor(Math.random() * THEMES.length)]!;
  const result = await runModel(ai, {
    messages: [{ role: "user", content: prompt(pick.theme, pick.palette) }],
    // generous budget: reasoning models spend tokens thinking before the JSON
    max_tokens: 24000,
  });

  const parsed = extractJson(aiText(result)) as { sprites?: unknown[] };
  const candidates = Array.isArray(parsed.sprites) ? parsed.sprites : [];
  if (candidates.length === 0) {
    throw new Error("model output parsed but contained no sprites");
  }

  const report: GenerationReport = { theme: pick.theme, published: [], rejected: [] };
  const statements: unknown[] = [];

  for (const raw of candidates.slice(0, BATCH_TARGET)) {
    const item = raw as { name?: unknown; tags?: unknown; recipe?: unknown };
    const name = String(item.name ?? "untitled").slice(0, 40).trim() || "untitled";

    const errors = validateRecipe(item.recipe);
    if (errors.length > 0) {
      report.rejected.push({ name, reason: errors[0]! });
      continue;
    }
    const recipe: Recipe = asRecipe(item.recipe);
    const grid = runRecipe(recipe);
    const filled = grid.data.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0) / grid.data.length;
    // opaque-background recipes (tiles) may legitimately fill the whole canvas
    const maxFill = recipe.palette?.transparent ? 0.9 : 1.0;
    if (filled < 0.04 || filled > maxFill) {
      report.rejected.push({ name, reason: `fill ratio ${filled.toFixed(2)} out of bounds` });
      continue;
    }

    const tags = [
      ...new Set(
        (Array.isArray(item.tags) ? item.tags : [])
          .map((t) => String(t).trim().toLowerCase())
          .filter((t) => /^[a-z0-9][a-z0-9-]{0,19}$/.test(t))
          .slice(0, 3),
      ),
      pick.theme,
      "botmade",
    ].slice(0, 5);

    const id = crypto.randomUUID();
    statements.push(
      db
        .prepare(
          `INSERT INTO sprite (id, userId, name, recipe, parentId, likeCount, createdAt, tags, model) VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?)`,
        )
        .bind(id, LOOMBOT_USER_ID, name, JSON.stringify(recipe), Date.now(), JSON.stringify(tags), MODEL),
      ...tags.map((tag) => db.prepare(`INSERT INTO sprite_tag (tag, spriteId) VALUES (?, ?)`).bind(tag, id)),
    );
    report.published.push({ id, name, tags });
  }

  if (statements.length > 0) await db.batch(statements);
  return report;
}
