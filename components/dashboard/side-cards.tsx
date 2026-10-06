import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatINR, plural } from "@/lib/format";
import type { getDashboard } from "@/services/dashboard.service";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

const PAYMENT_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card" } as const;

/** Today's takings by payment method — three numbers, so a list rather than a chart. */
export function PaymentsCard({ split }: { split: Dashboard["paymentSplit"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today by payment</CardTitle>
        <CardDescription>For counting the cash drawer and UPI receipts.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2 text-sm">
          {split.map((row) => (
            <div key={row.method} className="flex items-baseline justify-between gap-3">
              <dt>
                {PAYMENT_LABEL[row.method]}{" "}
                <span className="text-xs text-muted-foreground">
                  · {row.bills} {plural("bill", row.bills)}
                </span>
              </dt>
              <dd className="font-medium tabular-nums">{formatINR(row.amount)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function RecentSalesCard({ sales }: { sales: Dashboard["recentSales"] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Recent sales</CardTitle>
          <CardDescription>The last {sales.length || ""} bills</CardDescription>
        </div>
        <Link href="/sales?period=all" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          All sales <ArrowRight className="size-3" aria-hidden />
        </Link>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No sales yet.</p>
        ) : (
          <ul className="flex flex-col divide-y text-sm">
            {sales.map((sale) => (
              <li key={sale.id}>
                <Link href={`/sales/${sale.id}`} className="flex items-baseline justify-between gap-3 py-2 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block font-medium">{sale.invoiceNumber}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatDateTime(sale.createdAt)} · {sale.customerName ?? "Walk-in"} · {PAYMENT_LABEL[sale.paymentMethod]}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatINR(sale.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
