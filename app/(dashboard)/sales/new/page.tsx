import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "New Sale" };

export default function NewSalePage() {
  return (
    <ComingSoon
      icon={ShoppingCart}
      title="New Sale"
      phase="Phases 6–8"
      features={[
        "Fast medicine and barcode search",
        "Cart with automatic first-to-expire batch selection",
        "GST, discount and payment method (Cash / UPI / Card)",
        "Stock deducted safely, invoice number generated",
        "Bill preview and direct printing",
      ]}
    />
  );
}
