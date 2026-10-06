"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Pill } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { mainNavItems, newSaleItem, settingsItem, type NavItem } from "@/lib/navigation";
import { useTRPC } from "@/lib/trpc-client";

export function AppSidebar() {
  const pathname = usePathname();
  const trpc = useTRPC();
  // Medicines needing attention; refreshed every minute and after any saved change (see lib/trpc-client.tsx).
  const alerts = useQuery({ ...trpc.dashboard.alertCount.queryOptions(), staleTime: 60_000, refetchInterval: 5 * 60_000 });

  return (
    // print:hidden — bills are printed from the page itself (Phase 8), never with the app chrome.
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Medical Shop">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Pill className="size-4" />
                </div>
                <span className="font-heading text-base font-semibold">Medical Shop</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink
                  item={newSaleItem}
                  pathname={pathname}
                  className="bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-active:bg-primary data-active:text-primary-foreground"
                />
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <NavLink item={item} pathname={pathname} />
                  {item.href === "/inventory" && !!alerts.data && (
                    <SidebarMenuBadge
                      className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      title={`${alerts.data} medicines need attention (expired, expiring, low or out of stock)`}
                    >
                      {alerts.data}
                      <span className="sr-only"> medicines need attention</span>
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLink item={settingsItem} pathname={pathname} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

function NavLink({ item, pathname, className }: { item: NavItem; pathname: string; className?: string }) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuButton
      asChild
      isActive={item.isActive(pathname)}
      tooltip={item.title}
      // Slightly taller than the default for comfortable mouse use at the counter.
      className={cn("h-9", className)}
    >
      <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
        <item.icon />
        <span>{item.title}</span>
      </Link>
    </SidebarMenuButton>
  );
}
