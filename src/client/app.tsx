import { useCallback, useEffect, useState } from "react";
import { LogIn, LogOut, Search } from "lucide-react";
import { EXAMPLES } from "../engine/examples";
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

export type View = "forge" | "sprites" | "agent";

export function App() {
  const [view, setView] = useState<View>("sprites");
  const [me, setMe] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [source, setSource] = useState(() => JSON.stringify(EXAMPLES[0], null, 2));
  const [remixParentId, setRemixParentId] = useState<string | null>(null);

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

  function handleRemix(sprite: SpriteItem) {
    setSource(JSON.stringify({ ...sprite.recipe, name: `${sprite.name} remix` }, null, 2));
    setRemixParentId(sprite.id);
    setView("forge");
  }

  function handleTag(next: string | null) {
    setTag(next);
    if (next !== null) setView("sprites");
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
    setView("sprites");
  }

  async function signOut() {
    await Api.signOut().catch(() => null);
    setMe(null);
  }

  return (
    <SidebarProvider>
      <AppSidebar view={view} onNavigate={setView} tags={tags} activeTag={tag} onTag={handleTag} />
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
                if (e.target.value === "") setQuery("");
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
                <DropdownMenuItem
                  onClick={() => {
                    setQuery("");
                    setSearchInput("");
                    setTag(null);
                    setView("sprites");
                  }}
                >
                  my feed
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
              onSourceChange={(text) => {
                setSource(text);
              }}
              remixParentId={remixParentId}
              onPublished={() => {
                setRemixParentId(null);
                void refreshTags();
              }}
              signedIn={me !== null}
              onNeedAuth={() => setAuthOpen(true)}
            />
          ) : view === "sprites" ? (
            <SpritesView
              q={query}
              tag={tag}
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
