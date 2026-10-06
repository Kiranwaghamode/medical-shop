"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import Link from "next/link";
import { PrintHeader } from "@/components/reports/print-header";
import { ReportSection, ReportTable, ReportTile } from "@/components/reports/report-parts";
import { formatDayRange, formatINR, formatPacks, formatUnits } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";
import type { ReportRangeInput } from "@/lib/validations";

export function TopMedicinesReport({ range, sortBy }: { range: ReportRangeInput; sortBy: "amount" | "quantity" }) {
  const trpc = useTRPC();
  const report = useQuery({ ...trpc.reports.topMedicines.queryOptions({ range, sortBy, limit: 50 }), placeholderData: keepPreviousData });
  const data = report.data;

  if (report.isError) return <p className="text-destructive">Couldn&apos;t load the report: {report.error.message}</p>;

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", report.isFetching && !report.isPending && "opacity-60")}>
      <PrintHeader
        title={sortBy === "amount" ? "Top medicines by sales" : "Top medicines by quantity"}
        period={data ? formatDayRange(data.range.from, data.range.to) : ""}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <ReportTile label={`Sales · ${data ? formatDayRange(data.range.from, data.range.to) : ""}`} value={data && formatINR(data.totalAmount)} />
        <ReportTile label="Medicines sold" value={data && String(data.medicineCount)} />
      </div>

      {data && (
        <ReportSection
          title={sortBy === "amount" ? "Top medicines by sales" : "Top medicines by quantity"}
          description={`Sales are after discount. Showing the top ${Math.min(50, data.medicineCount)}.`}
        >
          <ReportTable
            head={["#", "Medicine", "Quantity sold", "Sales", "Share of sales"]}
            numeric={[0, 2, 3, 4]}
            rows={data.items.map((item) => [
              item.rank,
              <span key="name">
                <Link href={`/inventory/${item.id}`} className="font-medium hover:underline">
                  {item.name}
                </Link>
                {item.genericName && <span className="block text-xs text-muted-foreground">{item.genericName}</span>}
              </span>,
              <span key="qty">
                {formatUnits(item.units, item.unitLabel)}
                {item.packSize > 1 && <span className="block text-xs text-muted-foreground">{formatPacks(item.units, item)}</span>}
              </span>,
              formatINR(item.amount),
              `${item.share}%`,
            ])}
          />
        </ReportSection>
      )}
    </div>
  );
}
