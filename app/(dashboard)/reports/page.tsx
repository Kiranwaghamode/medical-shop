import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <ComingSoon
      icon={ChartColumn}
      title="Reports"
      phase="Phase 11"
      features={[
        "Daily, weekly, monthly and date-range sales",
        "Top-selling medicines",
        "Stock report",
        "Expiry report",
      ]}
    />
  );
}
