import type { Metadata } from "next";
import { Suspense } from "react";
import { SalesHistory } from "@/components/sales/sales-history";

export const metadata: Metadata = { title: "Sales History" };

export default function SalesHistoryPage() {
  return (
    // SalesHistory reads its filters from the URL.
    <Suspense>
      <SalesHistory />
    </Suspense>
  );
}
