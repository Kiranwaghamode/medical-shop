"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PrintHeader } from "@/components/reports/print-header";
import { ReportSection, ReportTable, ReportTile } from "@/components/reports/report-parts";
import { formatDayRange, formatINR, formatPacks, formatUnits } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";

export function StockReport() {
  const trpc = useTRPC();
  const report = useQuery(trpc.reports.stock.queryOptions());
  const data = report.data;

  if (report.isError) return <p className="text-destructive">Couldn&apos;t load the report: {report.error.message}</p>;

  return (
    <div className="flex flex-col gap-6">
      <PrintHeader title="Stock report" period={data ? `As of ${formatDayRange(data.asOf, data.asOf)}` : ""} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <ReportTile label="Stock value at purchase price" value={data && formatINR(data.totals.purchaseValue)} note="Sellable stock only" />
        <ReportTile label="Stock value at selling price" value={data && formatINR(data.totals.sellingValue)} />
        <ReportTile
          label="Expired stock (at purchase price)"
          value={data && formatINR(data.totals.expiredValue)}
          tone={data && Number(data.totals.expiredValue) > 0 ? "danger" : undefined}
          note="Can't be sold"
        />
        <ReportTile label="Medicines" value={data && String(data.totals.medicines)} note={data ? `As of ${formatDayRange(data.asOf, data.asOf)}` : undefined} />
      </div>

      {data && (
        <ReportSection title="Stock by medicine" description="Prices are per pack; values are worked out from the units in stock.">
          <ReportTable
            head={["Medicine", "Sellable stock", "Value (purchase)", "Value (selling)", "Expired stock", "Expired value"]}
            numeric={[1, 2, 3, 4, 5]}
            rows={data.items.map((item) => [
              <span key="name">
                <Link href={`/inventory/${item.id}`} className="font-medium hover:underline">
                  {item.name}
                </Link>
                {!item.isActive && <span className="ml-1.5 text-xs text-muted-foreground">(inactive)</span>}
                {item.genericName && <span className="block text-xs text-muted-foreground">{item.genericName}</span>}
              </span>,
              <span key="stock">
                {formatUnits(item.sellableUnits, item.unitLabel)}
                {item.packSize > 1 && item.sellableUnits > 0 && (
                  <span className="block text-xs text-muted-foreground">{formatPacks(item.sellableUnits, item)}</span>
                )}
              </span>,
              formatINR(item.purchaseValue),
              formatINR(item.sellingValue),
              item.expiredUnits > 0 ? formatUnits(item.expiredUnits, item.unitLabel) : "—",
              item.expiredUnits > 0 ? formatINR(item.expiredValue) : "—",
            ])}
            muted={(i) => data.items[i].sellableUnits === 0 && data.items[i].expiredUnits === 0}
            foot={[
              `Total (${data.totals.medicines})`,
              "",
              formatINR(data.totals.purchaseValue),
              formatINR(data.totals.sellingValue),
              "",
              formatINR(data.totals.expiredValue),
            ]}
          />
        </ReportSection>
      )}
    </div>
  );
}
