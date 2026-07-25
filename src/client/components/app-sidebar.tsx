import { Bot, Hammer, LayoutGrid, LibraryBig } from "lucide-react";
import { LOGO } from "../../engine/logo";
import type { CollectionItem } from "../api";
import { RecipeCanvas } from "./recipe-canvas";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { View } from "../app";

export function AppSidebar({
  view,
  onNavigate,
  collections,
  activeCollection,
  onCollection,
}: {
  view: View;
  onNavigate: (view: View) => void;
  collections: CollectionItem[];
  activeCollection: string | null;
  onCollection: (id: string | null) => void;
}) {
  return (
    <Sidebar collapsible="icon" className="border-r-2">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => onNavigate("sprites")}>
              <RecipeCanvas recipe={LOGO} pixel={2} className="size-8 shrink-0 !bg-none" title="spriteloom" />
              <div className="leading-tight group-data-[collapsible=icon]:hidden">
                <div className="font-bold tracking-[0.3em]">SPRITELOOM</div>
                <div className="text-xs text-muted-foreground">sprite foundry</div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>WORKSHOP</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === "sprites"} onClick={() => onNavigate("sprites")} tooltip="Sprites">
                  <LayoutGrid />
                  <span>Sprites</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={view === "forge"} onClick={() => onNavigate("forge")} tooltip="Forge">
                  <Hammer />
                  <span>Forge</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={view === "agent"}
                  onClick={() => onNavigate("agent")}
                  tooltip="Connect agent"
                >
                  <Bot />
                  <span>Connect agent</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {collections.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>COLLECTIONS</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {collections.slice(0, 12).map((collection) => (
                  <SidebarMenuItem key={collection.id}>
                    <SidebarMenuButton
                      isActive={activeCollection === collection.id}
                      onClick={() => onCollection(activeCollection === collection.id ? null : collection.id)}
                      title={collection.description ?? collection.name}
                    >
                      <LibraryBig />
                      <span className="truncate">{collection.name}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>{collection.count}</SidebarMenuBadge>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="group-data-[collapsible=icon]:hidden">
        <p className="px-2 text-xs text-muted-foreground">
          sprites are recipes, not pixels ·{" "}
          <a href="/api/spec" target="_blank" rel="noreferrer" className="underline">
            spec
          </a>{" "}
          ·{" "}
          <a
            href="https://github.com/ilrein/spriteloom"
            target="_blank"
            rel="noreferrer"
            className="underline"
            title="open source on GitHub (MIT)"
          >
            github
          </a>
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
