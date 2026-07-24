import type { Recipe } from "../engine/engine";

export interface SpriteItem {
  id: string;
  name: string;
  recipe: Recipe;
  parentId: string | null;
  likeCount: number;
  createdAt: number;
  username: string;
  tags: string[];
  liked?: boolean;
}

export interface FeedPage {
  sprites: SpriteItem[];
  page: number;
  hasMore: boolean;
  me: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    ...init,
  });
  const data = (await res.json().catch(() => null)) as (T & { errors?: string[]; message?: string }) | null;
  if (!res.ok) {
    throw new Error(data?.errors?.join("\n") ?? data?.message ?? `request failed (${res.status})`);
  }
  return data as T;
}

export const Api = {
  session: () =>
    call<{ user?: { username?: string | null; name?: string } } | null>("/api/auth/get-session"),

  signUp: (username: string, email: string, password: string) =>
    call("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name: username, username, email, password }),
    }),

  signIn: (username: string, password: string) =>
    call("/api/auth/sign-in/username", { method: "POST", body: JSON.stringify({ username, password }) }),

  signOut: () => call("/api/auth/sign-out", { method: "POST", body: "{}" }),

  listSprites: (opts: { sort: "new" | "top"; page: number; q?: string; tag?: string; user?: string }) => {
    const params = new URLSearchParams({ sort: opts.sort, page: String(opts.page) });
    if (opts.q) params.set("q", opts.q);
    if (opts.tag) params.set("tag", opts.tag);
    if (opts.user) params.set("user", opts.user);
    return call<FeedPage>(`/api/sprites?${params}`);
  },

  publish: (name: string, recipe: Recipe, tags: string[], parentId: string | null) =>
    call<{ id: string }>("/api/sprites", {
      method: "POST",
      body: JSON.stringify({ name, recipe, tags, parentId }),
    }),

  toggleLike: (id: string) =>
    call<{ liked: boolean; likeCount: number }>(`/api/sprites/${id}/like`, { method: "POST", body: "{}" }),

  deleteSprite: (id: string) => call<{ deleted: string }>(`/api/sprites/${id}`, { method: "DELETE" }),

  listTags: () => call<{ tags: { tag: string; count: number }[] }>("/api/tags"),

  agentTokenStatus: () =>
    call<{ exists: boolean; prefix?: string; createdAt?: number }>("/api/agent-token"),

  agentTokenCreate: () => call<{ token: string; prefix: string }>("/api/agent-token", { method: "POST", body: "{}" }),

  agentTokenRevoke: () => call<{ revoked: boolean }>("/api/agent-token", { method: "DELETE" }),
};
