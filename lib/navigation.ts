import {
  ChartColumn,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  // Which paths count as "this page" for highlighting and the header title.
  isActive: (pathname: string) => boolean;
};

const startsWith = (prefix: string) => (pathname: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

// The most-used action at the counter; shown prominently above the other links.
export const newSaleItem: NavItem = {
  title: "New Sale",
  href: "/sales/new",
  icon: ShoppingCart,
  isActive: startsWith("/sales/new"),
};

export const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, isActive: startsWith("/dashboard") },
  { title: "Inventory", href: "/inventory", icon: Package, isActive: startsWith("/inventory") },
  {
    title: "Sales History",
    href: "/sales",
    icon: ReceiptText,
    // /sales and /sales/[id], but not /sales/new.
    isActive: (pathname) => startsWith("/sales")(pathname) && !newSaleItem.isActive(pathname),
  },
  { title: "Reports", href: "/reports", icon: ChartColumn, isActive: startsWith("/reports") },
];

export const settingsItem: NavItem = {
  title: "Settings",
  href: "/settings",
  icon: Settings,
  isActive: startsWith("/settings"),
};

export const allNavItems = [newSaleItem, ...mainNavItems, settingsItem];
