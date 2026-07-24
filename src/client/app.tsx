import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { LogIn, LogOut, Search } from "lucide-react";
import { Api, type SpriteItem } from "./api";
import { AppSidebar } from "./components/app-sidebar";
import { AuthDialog } from "./components/auth-dialog";
import { PixelAvatar } from "./components/pixel-avatar";
import { AgentView } from "./views/agent";
import { ForgeView } from "./views/forge";
import { SpritesView } from "./views/sprites";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export type View = "sprites" | "forge" | "agent";

export const VIEW_PATH: Record<View, string> = { sprites: "/", forge: "/forge", agent: "/agent" };

const INITIAL_SOURCE = JSON.stringify(
  {
    name: "untitled",
    size: 16,
    palette: { colors: ["#151515", "#e0e0cc"], transparent: true },
    ops: [],
  },
  null,
  2,
);

interface History {
  stack: string[];
  idx: number;
  lastAt: number;
}

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const view: View = location.pathname.startsWith("/forge")
    ? "forge"
    : location.pathname.startsWith("/agent")
      ? "agent"
      : "sprites";
  const tag = searchParams.get("tag");
  const query = searchParams.get("q") ?? "";
  const byUser = searchParams.get("user");

  const [me, setMe] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [remixParentId, setRemixParentId] = useState<string | null>(null);

  // recipe source with undo/redo history (rapid edits within 600ms coalesce,
  // so textarea typing doesn't flood the stack while each paint stroke is one step)
  const [hist, setHist] = useState<History>({ stack: [INITIAL_SOURCE], idx: 0, lastAt: 0 });
  const source = hist.stack[hist.idx]!;

  const setSource = useCallback((text: string, opts?: { coalesce?: boolean }) => {
    setHist((h) => {
      const now = Date.now();
      const stack = h.stack.slice(0, h.idx + 1);
      if (opts?.coalesce && now - h.lastAt < 600 && h.idx > 0) {
        stack[stack.length - 1] = text;
        return { stack, idx: stack.length - 1, lastAt: now };
      }
      stack.push(text);
      if (stack.length > 200) stack.shift();
      return { stack, idx: stack.length - 1, lastAt: now };
    });
  }, []);

  const undo = useCallback(() => setHist((h) => (h.idx > 0 ? { ...h, idx: h.idx - 1, lastAt: 0 } : h)), []);
  const redo = useCallback(
    () => setHist((h) => (h.idx < h.stack.length - 1 ? { ...h, idx: h.idx + 1, lastAt: 0 } : h)),
    [],
  );

  const refreshSession = useCallback(async () => {
    try {
      const data = await Api.session();
      setMe(data?.user?.username ?? data?.user?.name ?? null);
    } catch {
      setMe(null);
    }
  }, []);

  const refreshTags = useCallback(async () => {
    try {
      const data = await Api.listTags();
      setTags(data.tags);
    } catch {
      /* sidebar tags are decorative — ignore */
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    void refreshTags();
  }, [refreshSession, refreshTags]);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  function handleRemix(sprite: SpriteItem) {
    setSource(JSON.stringify({ ...sprite.recipe, name: `${sprite.name} remix` }, null, 2));
    setRemixParentId(sprite.id);
    navigate(VIEW_PATH.forge);
  }

  function spritesUrl(next: { q?: string | null; tag?: string | null; user?: string | null }): string {
    const params = new URLSearchParams();
    const q = next.q === undefined ? query : next.q;
    const t = next.tag === undefined ? tag : next.tag;
    const u = next.user === undefined ? byUser : next.user;
    if (q) params.set("q", q);
    if (t) params.set("tag", t);
    if (u) params.set("user", u);
    const search = params.toString();
    return search ? `/?${search}` : "/";
  }

  const handleTag = (next: string | null) => navigate(spritesUrl({ tag: next }));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(spritesUrl({ q: searchInput.trim() || null, user: null }));
  }

  async function signOut() {
    await Api.signOut().catch(() => null);
    setMe(null);
  }

  return (
    <SidebarProvider>
      <AppSidebar
        view={view}
        onNavigate={(v) => navigate(VIEW_PATH[v])}
        tags={tags}
        activeTag={tag}
        onTag={handleTag}
      />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b-2 bg-background px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <span className="text-sm font-bold tracking-[0.3em] uppercase">{view}</span>

          <form onSubmit={submitSearch} className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (e.target.value === "" && query) navigate(spritesUrl({ q: null }));
              }}
              placeholder="search sprites, makers, tags…"
              className="pl-8"
            />
          </form>

          {me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <PixelAvatar username={me} size={24} />
                  <span className="hidden sm:inline">@{me}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-2">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <PixelAvatar username={me} size={20} /> @{me}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(spritesUrl({ q: null, tag: null, user: me }))}>
                  my sprites
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut className="size-4" /> sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" onClick={() => setAuthOpen(true)}>
              <LogIn className="size-4" /> sign in
            </Button>
          )}
        </header>

        <main className="flex-1 p-4">
          {view === "forge" ? (
            <ForgeView
              source={source}
              onSourceChange={setSource}
              onUndo={undo}
              onRedo={redo}
              canUndo={hist.idx > 0}
              canRedo={hist.idx < hist.stack.length - 1}
              remixParentId={remixParentId}
              onPublished={() => {
                setRemixParentId(null);
                void refreshTags();
                // land on the feed with the fresh sprite at the top
                navigate("/");
              }}
              signedIn={me !== null}
              onNeedAuth={() => setAuthOpen(true)}
            />
          ) : view === "sprites" ? (
            <SpritesView
              q={query}
              tag={tag}
              user={byUser}
              onTag={handleTag}
              onRemix={handleRemix}
              onNeedAuth={() => setAuthOpen(true)}
              signedIn={me !== null}
            />
          ) : (
            <AgentView signedIn={me !== null} onNeedAuth={() => setAuthOpen(true)} />
          )}
        </main>
      </SidebarInset>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} onSignedIn={() => void refreshSession()} />
    </SidebarProvider>
  );
}
