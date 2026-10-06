import { cookies } from "next/headers";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAllowedUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Every page in the (dashboard) group requires a signed-in user on the ALLOWED_EMAILS list.
// Data is protected separately by tRPC's protectedProcedure.
export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await requireAllowedUser();

  const [cookieStore, shop] = await Promise.all([
    cookies(),
    db.shop.findUniqueOrThrow({ where: { id: user.shopId }, select: { name: true } }),
  ]);
  // Remember whether the sidebar was collapsed (the sidebar component stores this cookie).
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader shopName={shop.name} />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
