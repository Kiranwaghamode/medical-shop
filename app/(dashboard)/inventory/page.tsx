import { Package } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <ComingSoon
      icon={Package}
      title="Inventory"
      phase="Phase 5"
      features={[
        "Search medicines by name, generic name or barcode",
        "Add, edit and deactivate medicines",
        "Manage batches: expiry, MRP, prices and stock",
        "Low-stock and expiry status",
      ]}
    />
  );
}
