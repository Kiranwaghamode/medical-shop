import type { Metadata } from "next";
import { Suspense } from "react";
import { InventoryList } from "@/components/inventory/inventory-list";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    // InventoryList reads search/filter/page from the URL.
    <Suspense>
      <InventoryList />
    </Suspense>
  );
}
