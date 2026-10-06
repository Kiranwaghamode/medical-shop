import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertsCard } from "@/components/dashboard/alerts-card";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { PaymentsCard, RecentSalesCard } from "@/components/dashboard/side-cards";
import { Button } from "@/components/ui/button";
import { requireAllowedUser } from "@/lib/auth";
import { getDashboard } from "@/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

// Read on the server on every visit, so the figures are always current. Scoped to the user's shop.
export default async function DashboardPage() {
  const user = await requireAllowedUser();
  const data = await getDashboard(user.shopId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex justify-end">
        <Button asChild size="lg">
          <Link href="/sales/new">
            <ShoppingCart /> New sale
          </Link>
        </Button>
      </div>

      <KpiRow data={data} />

      <SalesChart days={data.chart} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AlertsCard alerts={data.alerts} />
        <div className="flex flex-col gap-6">
          <PaymentsCard split={data.paymentSplit} />
          <RecentSalesCard sales={data.recentSales} />
        </div>
      </div>
    </div>
  );
}
