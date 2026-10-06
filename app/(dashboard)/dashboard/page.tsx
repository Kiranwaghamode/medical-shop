import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <ComingSoon
      icon={LayoutDashboard}
      title="Dashboard"
      phase="Phase 10"
      features={[
        "Today's, this week's and this month's sales",
        "Number of orders",
        "Low-stock and expiry alerts",
        "Sales chart",
      ]}
    />
  );
}
