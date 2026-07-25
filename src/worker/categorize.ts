// Vision auto-categorization: when a sprite is published without tags, render
// it and ask an image model which game-asset category it is. Best-effort —
// failures leave the sprite untagged.

import { runRecipe, type Recipe } from "../engine/engine";
import { encodePng } from "../engine/png";

const VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const CATEGORIES = ["creature", "item", "weapon", "tile", "plant", "structure", "ui"] as const;

interface AiBinding {
  run(model: string, options: Record<string, unknown>, config?: Record<string, unknown>): Promise<unknown>;
}

interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> };
  };
  batch(statements: unknown[]): Promise<unknown[]>;
}

export async function autoCategorize(ai: AiBinding, db: D1Like, spriteId: string, recipe: Recipe): Promise<void> {
  try {
    const png = await encodePng(runRecipe(recipe), recipe.palette, 8);
    const result = (await ai.run(
      VISION_MODEL,
      {
        image: [...png],
        prompt:
          `This is a small retro pixel-art video game sprite named "${recipe.name ?? "sprite"}". ` +
          `Classify it. Answer with exactly one word from this list: ${CATEGORIES.join(", ")}`,
        max_tokens: 16,
      },
      { gateway: { id: "spriteloom", skipCache: true, metadata: { app: "spriteloom", job: "categorize" } } },
    ).catch(() => ai.run(VISION_MODEL, {
      image: [...png],
      prompt:
        `This is a small retro pixel-art video game sprite named "${recipe.name ?? "sprite"}". ` +
        `Classify it. Answer with exactly one word from this list: ${CATEGORIES.join(", ")}`,
      max_tokens: 16,
    }))) as { description?: string; response?: string };

    const text = (result.description ?? result.response ?? "").toLowerCase();
    const category = CATEGORIES.find((c) => text.includes(c));
    if (!category) return;

    const row = await db.prepare(`SELECT tags FROM sprite WHERE id = ?`).bind(spriteId).first<{ tags: string }>();
    if (!row) return;
    const tags: string[] = JSON.parse(row.tags || "[]");
    if (tags.includes(category)) return;
    tags.push(category);
    await db.batch([
      db.prepare(`UPDATE sprite SET tags = ? WHERE id = ?`).bind(JSON.stringify(tags), spriteId),
      db.prepare(`INSERT OR IGNORE INTO sprite_tag (tag, spriteId) VALUES (?, ?)`).bind(category, spriteId),
    ]);
  } catch (err) {
    console.warn(`autoCategorize failed for ${spriteId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
