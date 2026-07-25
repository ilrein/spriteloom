import { useCallback, useEffect, useState } from "react";
import { GitFork, Heart, LayoutGrid, LibraryBig, Table2, X } from "lucide-react";
import { Api, type CollectionItem, type SpriteItem } from "../api";
import { RecipeCanvas } from "../components/recipe-canvas";
import { PixelAvatar } from "../components/pixel-avatar";
import { SpriteCard } from "../components/sprite-card";
import { Tip } from "../components/tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function SpritesView({
  q,
  tag,
  user,
  collection,
  collectionName,
  myCollections,
  onCollectionsChanged,
  onTag,
  onCollection,
  onRemix,
  onNeedAuth,
  signedIn,
}: {
  q: string;
  tag: string | null;
  user: string | null;
  collection: string | null;
  collectionName: string | null;
  myCollections: CollectionItem[];
  onCollectionsChanged: () => void;
  onTag: (tag: string | null) => void;
  onCollection: (id: string | null) => void;
  onRemix: (sprite: SpriteItem) => void;
  onNeedAuth: () => void;
  signedIn: boolean;
}) {
  const [sort, setSort] = useState<"new" | "top">("new");
  const [layout, setLayout] = useState<"grid" | "table">("grid");
  const [sprites, setSprites] = useState<SpriteItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collectDialog, setCollectDialog] = useState<{ spriteId: string } | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const data = await Api.listSprites({
          sort,
          page: nextPage,
          q: q || undefined,
          tag: tag ?? undefined,
          user: user ?? undefined,
          collection: collection ?? undefined,
        });
        setSprites((prev) => (replace ? data.sprites : [...prev, ...data.sprites]));
        setPage(nextPage);
        setHasMore(data.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [sort, q, tag, user, collection],
  );

  useEffect(() => {
    void load(0, true);
  }, [load]);

  async function toggleLike(sprite: SpriteItem) {
    if (!signedIn) {
      onNeedAuth();
      return;
    }
    try {
      const res = await Api.toggleLike(sprite.id);
      setSprites((prev) =>
        prev.map((s) => (s.id === sprite.id ? { ...s, liked: res.liked, likeCount: res.likeCount } : s)),
      );
    } catch {
      /* leave the count as-is */
    }
  }

  async function addToCollection(collectionId: string, spriteId: string) {
    try {
      await Api.addToCollection(collectionId, spriteId);
      onCollectionsChanged();
    } catch {
      /* ignore */
    }
  }

  async function createAndAdd() {
    const name = newCollectionName.trim();
    if (!name || !collectDialog) return;
    try {
      const created = await Api.createCollection(name);
      await Api.addToCollection(created.id, collectDialog.spriteId);
      onCollectionsChanged();
    } finally {
      setCollectDialog(null);
      setNewCollectionName("");
    }
  }

  function handleCollect(sprite: SpriteItem, collectionId: string | "new") {
    if (!signedIn) {
      onNeedAuth();
      return;
    }
    if (collectionId === "new") {
      setCollectDialog({ spriteId: sprite.id });
      return;
    }
    void addToCollection(collectionId, sprite.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={sort === "new" ? "default" : "outline"} onClick={() => setSort("new")}>
          NEW
        </Button>
        <Button size="sm" variant={sort === "top" ? "default" : "outline"} onClick={() => setSort("top")}>
          TOP
        </Button>
        {collection && (
          <Badge variant="secondary" className="cursor-pointer gap-1" onClick={() => onCollection(null)}>
            <LibraryBig className="size-3" /> {collectionName ?? "collection"} <X className="size-3" />
          </Badge>
        )}
        {tag && (
          <Badge variant="secondary" className="cursor-pointer gap-1" onClick={() => onTag(null)}>
            #{tag} <X className="size-3" />
          </Badge>
        )}
        {q && <span className="text-sm text-muted-foreground">searching “{q}”</span>}
        {user && <span className="text-sm text-muted-foreground">by @{user}</span>}
        <div className="ml-auto flex gap-1">
          <Tip label="grid view">
            <Button
              size="icon-sm"
              variant={layout === "grid" ? "default" : "outline"}
              onClick={() => setLayout("grid")}
              aria-label="grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </Tip>
          <Tip label="table view">
            <Button
              size="icon-sm"
              variant={layout === "table" ? "default" : "outline"}
              onClick={() => setLayout("table")}
              aria-label="table view"
            >
              <Table2 className="size-4" />
            </Button>
          </Tip>
        </div>
      </div>

      {error && <p className="border-2 border-destructive p-3 text-sm text-destructive">{error}</p>}

      {sprites.length === 0 && !loading && !error && (
        <p className="text-muted-foreground">nothing here yet — forge something and publish it.</p>
      )}

      {layout === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-6">
          {sprites.map((sprite) => (
            <SpriteCard
              key={sprite.id}
              sprite={sprite}
              myCollections={myCollections}
              onLike={toggleLike}
              onRemix={onRemix}
              onTag={(t) => onTag(t)}
              onCollect={handleCollect}
            />
          ))}
        </div>
      ) : (
        <div className="border-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14"></TableHead>
                <TableHead>name</TableHead>
                <TableHead>by</TableHead>
                <TableHead>tags</TableHead>
                <TableHead className="w-24">size</TableHead>
                <TableHead className="w-20">likes</TableHead>
                <TableHead className="w-40">actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sprites.map((sprite) => (
                <TableRow key={sprite.id}>
                  <TableCell>
                    <RecipeCanvas recipe={sprite.recipe} pixel={Math.max(1, Math.floor(36 / sprite.recipe.size))} />
                  </TableCell>
                  <TableCell className="font-bold">{sprite.name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <PixelAvatar username={sprite.username} size={16} />@{sprite.username}
                      {sprite.parentId && <GitFork className="size-3" aria-label="remix" />}
                      {sprite.model && (
                        <span className="text-xs text-muted-foreground">· {sprite.model.split("/").pop()}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {sprite.tags.map((t) => (
                        <Badge key={t} variant="outline" className="cursor-pointer" onClick={() => onTag(t)}>
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sprite.recipe.size}×{sprite.recipe.size}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant={sprite.liked ? "default" : "ghost"} onClick={() => toggleLike(sprite)}>
                      <Heart className={cn("size-3.5", sprite.liked && "fill-current")} />
                      {sprite.likeCount}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <span className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => onRemix(sprite)}>
                        remix
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a href={`/api/sprites/${sprite.id}.png?scale=8`} target="_blank" rel="noreferrer">
                          png
                        </a>
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {hasMore && (
        <Button variant="outline" disabled={loading} onClick={() => void load(page + 1, false)} className="self-start">
          {loading ? "loading…" : "MORE"}
        </Button>
      )}

      <Dialog open={collectDialog !== null} onOpenChange={(open) => !open && setCollectDialog(null)}>
        <DialogContent className="max-w-sm border-2">
          <DialogHeader>
            <DialogTitle className="tracking-[0.3em]">NEW COLLECTION</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createAndAdd();
            }}
            className="grid gap-3"
          >
            <Input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="dungeon starter pack"
              maxLength={40}
              autoFocus
            />
            <Button type="submit" disabled={!newCollectionName.trim()}>
              create & add sprite
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
