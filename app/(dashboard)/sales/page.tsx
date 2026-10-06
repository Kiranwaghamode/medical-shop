import { ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Sales History" };

export default function SalesHistoryPage() {
  return (
    <ComingSoon
      icon={ReceiptText}
      title="Sales History"
      phase="Phase 9"
      features={[
        "All sales with invoice search",
        "Filter by today, week, month or custom dates",
        "View any sale and print its bill again",
      ]}
    />
  );
}
