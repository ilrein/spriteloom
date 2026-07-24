import { Download, GitFork, Heart } from "lucide-react";
import type { SpriteItem } from "../api";
import { RecipeCanvas } from "./recipe-canvas";
import { PixelAvatar } from "./pixel-avatar";
import { Tip } from "./tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SpriteCard({
  sprite,
  onLike,
  onRemix,
  onTag,
}: {
  sprite: SpriteItem;
  onLike: (sprite: SpriteItem) => void;
  onRemix: (sprite: SpriteItem) => void;
  onTag: (tag: string) => void;
}) {
  return (
    <Card className="gap-3 border-2 py-3">
      <CardContent className="flex flex-col items-center gap-2 px-3">
        <RecipeCanvas recipe={sprite.recipe} pixel={Math.max(2, Math.floor(112 / sprite.recipe.size))} className="border" />
        <div className="w-full">
          <div className="truncate font-bold" title={sprite.name}>
            {sprite.name}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <PixelAvatar username={sprite.username} size={16} />
            <span className="truncate">@{sprite.username}</span>
            {sprite.parentId && <GitFork className="size-3 shrink-0" aria-label="remix" />}
          </div>
          {sprite.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {sprite.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => onTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex-wrap gap-1.5 px-3">
        <Button size="sm" variant={sprite.liked ? "default" : "outline"} onClick={() => onLike(sprite)}>
          <Heart className={cn("size-3.5", sprite.liked && "fill-current")} />
          {sprite.likeCount}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onRemix(sprite)}>
          <GitFork className="size-3.5" />
          remix
        </Button>
        <Tip label="open PNG">
          <Button size="icon-sm" variant="ghost" asChild className="ml-auto">
            <a href={`/api/sprites/${sprite.id}.png?scale=8`} target="_blank" rel="noreferrer" aria-label="open PNG">
              <Download className="size-3.5" />
            </a>
          </Button>
        </Tip>
      </CardFooter>
    </Card>
  );
}
