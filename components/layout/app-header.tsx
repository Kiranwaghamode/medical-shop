"use client";

import { UserButton } from "@clerk/nextjs";
import { Store } from "lucide-react";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { allNavItems } from "@/lib/navigation";

export function AppHeader({ shopName }: { shopName: string }) {
  const pathname = usePathname();
  const title = allNavItems.find((item) => item.isActive(pathname))?.title ?? "Medical Shop";

  return (
    // print:hidden — the header never appears on printed bills.
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 print:hidden">
      <SidebarTrigger className="-ml-1" title="Toggle sidebar (Ctrl+B)" />
      <Separator orientation="vertical" className="h-5!" />
      <h1 className="font-heading text-base font-semibold">{title}</h1>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex" title="Shop">
          <Store className="size-4" />
          <span className="max-w-56 truncate">{shopName}</span>
        </div>
        {/* Profile menu: Manage account and Sign out. */}
        <UserButton />
      </div>
    </header>
  );
}
