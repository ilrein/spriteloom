import { resolvePalette, runRecipe, toAscii, type Recipe } from "../engine/engine";
import { encodePng } from "../engine/png";
import { EXAMPLES, findExample } from "../engine/examples";
import { validateRecipe, asRecipe } from "../engine/validate";
import { SPEC } from "../engine/spec";
import { LOGO } from "../engine/logo";
import { encodePngRgba } from "../engine/png";
import { encodeVox, renderIso, scaleRgba, spriteToVoxels, voxelsToAscii, type VoxelMode } from "../engine/voxel";
import { createAuth } from "./auth";
import { generateBatch } from "./generate";

interface D1Result<T = unknown> {
  results: T[];
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  AI: { run(model: string, options: Record<string, unknown>): Promise<unknown> };
  BETTER_AUTH_SECRET: string;
  WRITE_LIMIT?: RateLimit;
  AUTH_LIMIT?: RateLimit;
  GENERATE_LIMIT?: RateLimit;
  RENDER_LIMIT?: RateLimit;
}

/** Returns true when the request should be rejected. Missing bindings (local dev) allow everything. */
async function overLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    return !(await limiter.limit({ key })).success;
  } catch {
    return false;
  }
}

const clientIp = (request: Request): string => request.headers.get("cf-connecting-ip") ?? "unknown";

const TOO_MANY = () => json({ errors: ["rate limited — slow down and retry shortly"] }, 429);

const MAX_RECIPE_BYTES = 8 * 1024;
const MAX_NAME_LENGTH = 40;
const PAGE_SIZE = 30;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS_HEADERS },
  });
}

function png(bytes: Uint8Array, name: string, cacheable = false): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "image/png",
      "content-disposition": `inline; filename="${name}.png"`,
      "cache-control": cacheable ? "public, max-age=300" : "no-store",
      ...CORS_HEADERS,
    },
  });
}

async function respondWithRecipe(recipe: Recipe, url: URL, cacheable = false): Promise<Response> {
  const grid = runRecipe(recipe);
  const format = url.searchParams.get("format") ?? "png";
  const scale = Number(url.searchParams.get("scale") ?? "1");
  const name = recipe.name ?? "sprite";

  switch (format) {
    case "text":
      return text(toAscii(grid) + "\n");
    case "json":
      return json({ name, size: grid.size, palette: resolvePalette(recipe.palette), rows: toAscii(grid).split("\n") });
    case "png":
      return png(await encodePng(grid, recipe.palette, Number.isFinite(scale) ? scale : 1), name, cacheable);
    default:
      return json({ errors: [`unknown format "${format}" (valid: png, text, json)`] }, 400);
  }
}

interface SessionUser {
  id: string;
  username: string;
}

const TOKEN_PREFIX = "slm_";

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Agents authenticate with `Authorization: Bearer slm_...` instead of cookies. */
async function getTokenUser(request: Request, env: Env): Promise<SessionUser | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith(`Bearer ${TOKEN_PREFIX}`)) return null;
  const hash = await sha256Hex(header.slice("Bearer ".length));
  const row = await env.DB.prepare(
    `SELECT t.userId AS id, u.username, u.name FROM agent_token t JOIN user u ON u.id = t.userId WHERE t.tokenHash = ?`,
  )
    .bind(hash)
    .first<{ id: string; username: string | null; name: string }>();
  return row ? { id: row.id, username: row.username ?? row.name } : null;
}

async function getCookieUser(request: Request, env: Env, url: URL): Promise<SessionUser | null> {
  const auth = createAuth(env.DB, url.origin, env.BETTER_AUTH_SECRET);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const u = session.user as { id: string; username?: string | null; name: string };
  return { id: u.id, username: u.username ?? u.name };
}

async function getSessionUser(request: Request, env: Env, url: URL): Promise<SessionUser | null> {
  return (await getTokenUser(request, env)) ?? (await getCookieUser(request, env, url));
}

/** Token management is cookie-session only: a leaked agent token cannot rotate itself. */
async function handleAgentToken(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await getCookieUser(request, env, url);
  if (!user) return json({ errors: ["sign in first"] }, 401);

  if (request.method === "GET") {
    const row = await env.DB.prepare(`SELECT prefix, createdAt FROM agent_token WHERE userId = ?`)
      .bind(user.id)
      .first<{ prefix: string; createdAt: number }>();
    return json(row ? { exists: true, prefix: row.prefix, createdAt: row.createdAt } : { exists: false });
  }

  if (request.method === "POST") {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = TOKEN_PREFIX + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
    await env.DB.prepare(
      `INSERT INTO agent_token (userId, tokenHash, prefix, createdAt) VALUES (?, ?, ?, ?)
       ON CONFLICT (userId) DO UPDATE SET tokenHash = excluded.tokenHash, prefix = excluded.prefix, createdAt = excluded.createdAt`,
    )
      .bind(user.id, await sha256Hex(token), prefix, Date.now())
      .run();
    return json({ token, prefix }, 201);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare(`DELETE FROM agent_token WHERE userId = ?`).bind(user.id).run();
    return json({ revoked: true });
  }

  return json({ errors: [`no route: ${request.method} ${url.pathname}`] }, 404);
}

interface SpriteRow {
  id: string;
  name: string;
  recipe: string;
  parentId: string | null;
  likeCount: number;
  createdAt: number;
  username: string | null;
  userId: string;
  tags: string;
  model: string | null;
}

function spriteToJson(row: SpriteRow, likedIds?: Set<string>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    recipe: JSON.parse(row.recipe),
    parentId: row.parentId,
    likeCount: row.likeCount,
    createdAt: row.createdAt,
    username: row.username,
    tags: JSON.parse(row.tags || "[]"),
    model: row.model,
    liked: likedIds ? likedIds.has(row.id) : undefined,
  };
}

const SPRITE_SELECT = `
  SELECT s.id, s.name, s.recipe, s.parentId, s.likeCount, s.createdAt, s.userId, s.tags, s.model, u.username
  FROM sprite s JOIN user u ON u.id = s.userId
`;

const MODEL_PATTERN = /^[a-zA-Z0-9@/._: -]{1,64}$/;

/** null = human via web UI; "unknown" = agent that didn't declare a model. */
function resolveModel(declared: unknown, viaAgentToken: boolean): string | null {
  if (typeof declared === "string" && MODEL_PATTERN.test(declared.trim())) {
    return declared.trim();
  }
  return viaAgentToken ? "unknown" : null;
}

const TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,19}$/;
const MAX_TAGS = 5;

function normalizeTags(input: unknown): { tags: string[]; error?: string } {
  if (input === undefined || input === null) return { tags: [] };
  if (!Array.isArray(input)) return { tags: [], error: "tags must be an array of strings" };
  const tags = [...new Set(input.map((t) => String(t).trim().toLowerCase()))].filter((t) => t.length > 0);
  if (tags.length > MAX_TAGS) return { tags: [], error: `too many tags (max ${MAX_TAGS})` };
  for (const tag of tags) {
    if (!TAG_PATTERN.test(tag)) {
      return { tags: [], error: `bad tag "${tag}" (lowercase letters, digits, hyphens, max 20 chars)` };
    }
  }
  return { tags };
}

async function listSprites(request: Request, env: Env, url: URL): Promise<Response> {
  const sort = url.searchParams.get("sort") === "top" ? "top" : "new";
  const page = Math.max(0, Number(url.searchParams.get("page") ?? "0") | 0);
  const byUser = url.searchParams.get("user");
  const byTag = url.searchParams.get("tag")?.toLowerCase() ?? null;
  const byModel = url.searchParams.get("model");
  const query = url.searchParams.get("q")?.trim() ?? null;

  let sql = SPRITE_SELECT;
  const where: string[] = [];
  const params: unknown[] = [];
  if (byTag) {
    sql += ` JOIN sprite_tag t ON t.spriteId = s.id`;
    where.push(`t.tag = ?`);
    params.push(byTag);
  }
  if (byUser) {
    where.push(`u.username = ?`);
    params.push(byUser);
  }
  if (byModel) {
    if (byModel === "human") where.push(`s.model IS NULL`);
    else {
      where.push(`s.model = ?`);
      params.push(byModel);
    }
  }
  if (query) {
    where.push(`(s.name LIKE ? OR u.username LIKE ? OR s.tags LIKE ?)`);
    const like = `%${query.replace(/[%_]/g, "")}%`;
    params.push(like, like, like);
  }
  if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
  sql += sort === "top" ? ` ORDER BY s.likeCount DESC, s.createdAt DESC` : ` ORDER BY s.createdAt DESC`;
  sql += ` LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`;

  const { results } = await env.DB.prepare(sql).bind(...params).all<SpriteRow>();
  const hasMore = results.length > PAGE_SIZE;
  const rows = results.slice(0, PAGE_SIZE);

  let likedIds: Set<string> | undefined;
  const user = await getSessionUser(request, env, url);
  if (user && rows.length > 0) {
    const placeholders = rows.map(() => "?").join(",");
    const { results: likes } = await env.DB.prepare(
      `SELECT spriteId FROM sprite_like WHERE userId = ? AND spriteId IN (${placeholders})`,
    )
      .bind(user.id, ...rows.map((r) => r.id))
      .all<{ spriteId: string }>();
    likedIds = new Set(likes.map((l) => l.spriteId));
  }

  return json({ sprites: rows.map((r) => spriteToJson(r, likedIds)), page, hasMore, me: user?.username ?? null });
}

async function publishSprite(request: Request, env: Env, url: URL): Promise<Response> {
  const tokenUser = await getTokenUser(request, env);
  const user = tokenUser ?? (await getCookieUser(request, env, url));
  if (!user) return json({ errors: ["sign in to publish"] }, 401);
  if (await overLimit(env.WRITE_LIMIT, `write:${user.id}`)) return TOO_MANY();

  let body: { name?: unknown; recipe?: unknown; parentId?: unknown; tags?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ errors: ["request body must be valid JSON"] }, 400);
  }
  const model = resolveModel(body.model, tokenUser !== null);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return json({ errors: [`name must be 1-${MAX_NAME_LENGTH} characters`] }, 400);
  }
  const errors = validateRecipe(body.recipe);
  if (errors.length > 0) return json({ errors }, 400);
  const recipeText = JSON.stringify(body.recipe);
  if (recipeText.length > MAX_RECIPE_BYTES) {
    return json({ errors: [`recipe too large (${recipeText.length} bytes, max ${MAX_RECIPE_BYTES})`] }, 400);
  }
  const { tags, error: tagError } = normalizeTags(body.tags);
  if (tagError) return json({ errors: [tagError] }, 400);

  let parentId: string | null = null;
  if (typeof body.parentId === "string" && body.parentId.length > 0) {
    const parent = await env.DB.prepare(`SELECT id FROM sprite WHERE id = ?`).bind(body.parentId).first();
    if (parent) parentId = body.parentId;
  }

  const id = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `INSERT INTO sprite (id, userId, name, recipe, parentId, likeCount, createdAt, tags, model) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    ).bind(id, user.id, name, recipeText, parentId, Date.now(), JSON.stringify(tags), model),
    ...tags.map((tag) => env.DB.prepare(`INSERT INTO sprite_tag (tag, spriteId) VALUES (?, ?)`).bind(tag, id)),
  ];
  await env.DB.batch(statements);

  return json({ id, name, username: user.username, tags, model }, 201);
}

async function toggleLike(request: Request, env: Env, url: URL, spriteId: string): Promise<Response> {
  const user = await getSessionUser(request, env, url);
  if (!user) return json({ errors: ["sign in to like"] }, 401);
  if (await overLimit(env.WRITE_LIMIT, `write:${user.id}`)) return TOO_MANY();

  const sprite = await env.DB.prepare(`SELECT id FROM sprite WHERE id = ?`).bind(spriteId).first();
  if (!sprite) return json({ errors: ["no such sprite"] }, 404);

  const existing = await env.DB.prepare(`SELECT 1 FROM sprite_like WHERE userId = ? AND spriteId = ?`)
    .bind(user.id, spriteId)
    .first();

  if (existing) {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM sprite_like WHERE userId = ? AND spriteId = ?`).bind(user.id, spriteId),
      env.DB.prepare(`UPDATE sprite SET likeCount = likeCount - 1 WHERE id = ?`).bind(spriteId),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO sprite_like (userId, spriteId, createdAt) VALUES (?, ?, ?)`).bind(
        user.id,
        spriteId,
        Date.now(),
      ),
      env.DB.prepare(`UPDATE sprite SET likeCount = likeCount + 1 WHERE id = ?`).bind(spriteId),
    ]);
  }

  const row = await env.DB.prepare(`SELECT likeCount FROM sprite WHERE id = ?`)
    .bind(spriteId)
    .first<{ likeCount: number }>();
  return json({ liked: !existing, likeCount: row?.likeCount ?? 0 });
}

async function handleSprites(request: Request, env: Env, url: URL, path: string): Promise<Response> {
  if (path === "/api/sprites") {
    if (request.method === "GET") return listSprites(request, env, url);
    if (request.method === "POST") return publishSprite(request, env, url);
  }

  const likeMatch = path.match(/^\/api\/sprites\/([0-9a-f-]{36})\/like$/);
  if (likeMatch && request.method === "POST") {
    return toggleLike(request, env, url, likeMatch[1]!);
  }

  const itemMatch = path.match(/^\/api\/sprites\/([0-9a-f-]{36})(\.png)?$/);
  if (itemMatch) {
    const row = await env.DB.prepare(`${SPRITE_SELECT} WHERE s.id = ?`).bind(itemMatch[1]).first<SpriteRow>();
    if (!row) return json({ errors: ["no such sprite"] }, 404);

    if (request.method === "GET") {
      if (itemMatch[2]) {
        const recipe = asRecipe(JSON.parse(row.recipe));
        recipe.name = row.name;
        return respondWithRecipe(recipe, url, true);
      }
      return json(spriteToJson(row));
    }
    if (request.method === "DELETE") {
      const user = await getSessionUser(request, env, url);
      if (!user) return json({ errors: ["sign in first"] }, 401);
      if (user.id !== row.userId) return json({ errors: ["not your sprite"] }, 403);
      await env.DB.prepare(`DELETE FROM sprite WHERE id = ?`).bind(row.id).run();
      return json({ deleted: row.id });
    }
  }

  return json({ errors: [`no route: ${request.method} ${path}`, "see GET /api/spec"] }, 404);
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (path.startsWith("/api/auth/")) {
    if (request.method === "POST" && (await overLimit(env.AUTH_LIMIT, `auth:${clientIp(request)}`))) {
      return TOO_MANY();
    }
    const auth = createAuth(env.DB, url.origin, env.BETTER_AUTH_SECRET);
    return auth.handler(request);
  }

  if (path === "/api/spec" && request.method === "GET") {
    return json(SPEC);
  }

  if (path === "/api/logo.png" && request.method === "GET") {
    const scale = Number(url.searchParams.get("scale") ?? "2");
    const bytes = await encodePng(runRecipe(LOGO), LOGO.palette, Number.isFinite(scale) ? scale : 2);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        ...CORS_HEADERS,
      },
    });
  }

  if (path === "/api/examples" && request.method === "GET") {
    return json({ examples: EXAMPLES });
  }

  const exampleMatch = path.match(/^\/api\/examples\/([a-z0-9-]+)(\.png)?$/);
  if (exampleMatch && request.method === "GET") {
    const recipe = findExample(exampleMatch[1]!);
    if (!recipe) {
      return json({ errors: [`no example named "${exampleMatch[1]}"`] }, 404);
    }
    if (!exampleMatch[2]) {
      return json(recipe);
    }
    return respondWithRecipe(recipe, url);
  }

  if (path === "/api/render" && request.method === "POST") {
    if (await overLimit(env.RENDER_LIMIT, `render:${clientIp(request)}`)) return TOO_MANY();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ errors: ["request body must be valid JSON"] }, 400);
    }
    const errors = validateRecipe(body);
    if (errors.length > 0) {
      return json({ errors }, 400);
    }
    return respondWithRecipe(asRecipe(body), url);
  }

  if (path === "/api/voxelize" && request.method === "POST") {
    if (await overLimit(env.RENDER_LIMIT, `render:${clientIp(request)}`)) return TOO_MANY();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ errors: ["request body must be valid JSON"] }, 400);
    }
    // body is either a recipe, or {front, side} for carve mode
    const wrapper = body as { front?: unknown; side?: unknown };
    const mode = (url.searchParams.get("mode") ?? "extrude") as VoxelMode;
    if (!["extrude", "inflate", "carve"].includes(mode)) {
      return json({ errors: [`unknown mode "${mode}" (valid: extrude, inflate, carve)`] }, 400);
    }
    const frontInput = mode === "carve" ? wrapper.front : body;
    const sideInput = mode === "carve" ? wrapper.side : undefined;
    for (const [label, input] of [["front", frontInput], ...(mode === "carve" ? [["side", sideInput]] : [])] as const) {
      const errors = validateRecipe(input);
      if (errors.length > 0) return json({ errors: errors.map((e) => `${label}: ${e}`) }, 400);
    }
    const recipe = asRecipe(frontInput);
    const depth = Math.max(2, Math.min(recipe.size, Number(url.searchParams.get("depth") ?? Math.round(recipe.size / 3))));
    const voxels = spriteToVoxels(recipe, mode, depth, sideInput ? asRecipe(sideInput) : undefined);

    const format = url.searchParams.get("format") ?? "png";
    if (format === "text") {
      return text(voxelsToAscii(voxels) + "\n");
    }
    if (format === "vox") {
      return new Response(encodeVox(voxels, recipe.palette) as unknown as BodyInit, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${recipe.name ?? "sprite"}.vox"`,
          ...CORS_HEADERS,
        },
      });
    }
    if (format === "png") {
      const scale = Math.max(1, Math.min(16, Number(url.searchParams.get("scale") ?? "4")));
      const img = scaleRgba(renderIso(voxels, recipe.palette), scale);
      const bytes = await encodePngRgba(img.width, img.height, img.data);
      return png(bytes, `${recipe.name ?? "sprite"}-iso`);
    }
    return json({ errors: [`unknown format "${format}" (valid: png, vox, text)`] }, 400);
  }

  if (path === "/api/generate" && request.method === "POST") {
    const user = await getSessionUser(request, env, url);
    if (!user) return json({ errors: ["sign in (or use an agent token) to trigger generation"] }, 401);
    if (await overLimit(env.GENERATE_LIMIT, `gen:${user.id}`)) return TOO_MANY();
    const report = await generateBatch(env.AI, env.DB);
    return json(report);
  }

  if (path.startsWith("/api/sprites")) {
    return handleSprites(request, env, url, path);
  }

  if (path === "/api/agent-token") {
    return handleAgentToken(request, env, url);
  }

  if (path === "/api/tags" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT tag, COUNT(*) AS count FROM sprite_tag GROUP BY tag ORDER BY count DESC, tag ASC LIMIT 30`,
    ).all<{ tag: string; count: number }>();
    return json({ tags: results });
  }

  return json({ errors: [`no route: ${request.method} ${path}`, "see GET /api/spec"] }, 404);
}

const CANONICAL_HOST = "spriteloom.app";
const REDIRECT_HOSTS = new Set(["www.spriteloom.app", "spriteloom.ilia-reingold.workers.dev"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (REDIRECT_HOSTS.has(url.hostname)) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ errors: [`internal error: ${err instanceof Error ? err.message : String(err)}`] }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  // themed sprite generation on a schedule — the feed grows on its own
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    ctx.waitUntil(
      generateBatch(env.AI, env.DB).then(
        (report) =>
          console.log(
            `loombot: theme=${report.theme} published=${report.published.length} rejected=${report.rejected.length}`,
          ),
        (err) => console.error(`loombot failed: ${err instanceof Error ? err.message : String(err)}`),
      ),
    );
  },
};
