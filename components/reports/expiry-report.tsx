"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, CalendarClock } from "lucide-react";
import Link from "next/link";
import { PrintHeader } from "@/components/reports/print-header";
import { ReportSection, ReportTable, ReportTile } from "@/components/reports/report-parts";
import { indiaIsoDate } from "@/lib/dates";
import { formatDayRange, formatExpiry, formatINR, formatPacks, formatUnits, plural } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";

export function ExpiryReport({ withinDays }: { withinDays: 30 | 60 | 90 }) {
  const trpc = useTRPC();
  const report = useQuery({ ...trpc.reports.expiry.queryOptions({ withinDays }), placeholderData: keepPreviousData });
  const data = report.data;

  if (report.isError) return <p className="text-destructive">Couldn&apos;t load the report: {report.error.message}</p>;

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", report.isFetching && !report.isPending && "opacity-60")}>
      <PrintHeader title={`Expiry report — expired and expiring within ${withinDays} days`} period={`As of ${formatDayRange(indiaIsoDate(), indiaIsoDate())}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <ReportTile
          label="Already expired"
          value={data && formatINR(data.totals.expiredValue)}
          note={data && `${data.totals.expiredBatches} ${data.totals.expiredBatches === 1 ? "batch" : "batches"}`}
          tone={data && data.totals.expiredBatches > 0 ? "danger" : undefined}
        />
        <ReportTile
          label={`Expiring within ${withinDays} days`}
          value={data && formatINR(data.totals.expiringValue)}
          note={data && `${data.totals.expiringBatches} ${data.totals.expiringBatches === 1 ? "batch" : "batches"}`}
          tone={data && data.totals.expiringBatches > 0 ? "warning" : undefined}
        />
      </div>

      {data && (
        <ReportSection title="Batches" description="Soonest first. Value is at purchase price — the money at risk.">
          <ReportTable
            head={["Medicine", "Batch", "Expiry", "Status", "Stock", "Value"]}
            numeric={[4, 5]}
            rows={data.items.map((item) => [
              <span key="name">
                <Link href={`/inventory/${item.medicine.id}`} className="font-medium hover:underline">
                  {item.medicine.name}
                </Link>
                {!item.medicine.isActive && <span className="ml-1.5 text-xs text-muted-foreground">(inactive)</span>}
              </span>,
              item.batchNumber,
              formatExpiry(item.expiryDate),
              // Status keeps an icon + words, never colour alone.
              item.expired ? (
                <span key="status" className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                  <AlertTriangle className="size-3.5" aria-hidden /> Expired {Math.abs(item.daysLeft)} {plural("day", Math.abs(item.daysLeft))} ago
                </span>
              ) : (
                <span key="status" className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-400">
                  <CalendarClock className="size-3.5" aria-hidden /> {item.daysLeft === 0 ? "Expires today" : `In ${item.daysLeft} ${plural("day", item.daysLeft)}`}
                </span>
              ),
              <span key="qty">
                {formatUnits(item.quantity, item.medicine.unitLabel)}
                {item.medicine.packSize > 1 && <span className="block text-xs text-muted-foreground">{formatPacks(item.quantity, item.medicine)}</span>}
              </span>,
              formatINR(item.value),
            ])}
            foot={["Total", "", "", "", "", formatINR(data.totals.totalValue)]}
          />
        </ReportSection>
      )}
    </div>
  );
}
