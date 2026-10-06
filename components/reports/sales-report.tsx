"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { PrintHeader } from "@/components/reports/print-header";
import { ResponsiveChart } from "@/components/dashboard/sales-chart";
import { ReportSection, ReportTable, ReportTile } from "@/components/reports/report-parts";
import { Card, CardContent } from "@/components/ui/card";
import { formatLongDay } from "@/lib/chart";
import { formatDayRange, formatINR, formatPercent } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";
import type { ReportRangeInput } from "@/lib/validations";

const PAYMENT_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card" } as const;

export function SalesReport({ range }: { range: ReportRangeInput }) {
  const trpc = useTRPC();
  const report = useQuery({ ...trpc.reports.sales.queryOptions(range), placeholderData: keepPreviousData });
  const data = report.data;

  if (report.isError) return <p className="text-destructive">Couldn&apos;t load the report: {report.error.message}</p>;

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", report.isFetching && !report.isPending && "opacity-60")}>
      <PrintHeader title="Sales report" period={data ? formatDayRange(data.range.from, data.range.to) : ""} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4">
        <ReportTile label={`Sales · ${data ? formatDayRange(data.range.from, data.range.to) : ""}`} value={data && formatINR(data.totals.amount)} note={data && `${data.totals.bills} bills`} />
        <ReportTile label="Before discount" value={data && formatINR(data.totals.subtotal)} />
        <ReportTile label="Discount given" value={data && formatINR(data.totals.discount)} />
        <ReportTile label="GST included" value={data && formatINR(data.totals.tax)} note="CGST + SGST below" />
      </div>

      {data && (
        <>
          <section className="flex flex-col gap-2 break-inside-avoid print:hidden">
            <h2 className="font-heading text-base font-semibold">Daily sales</h2>
            <Card>
              <CardContent>
                <ResponsiveChart days={data.days} />
              </CardContent>
            </Card>
          </section>

          <ReportSection title="GST summary" description="Prices include GST. Within the state, GST is split equally into CGST and SGST.">
            <ReportTable
              head={["GST rate", "Taxable value", "CGST", "SGST", "Total GST", "Sales (incl. GST)"]}
              numeric={[1, 2, 3, 4, 5]}
              rows={data.byGstRate.map((row) => [
                formatPercent(row.rate),
                formatINR(row.taxable),
                formatINR(row.cgst),
                formatINR(row.sgst),
                formatINR(row.tax),
                formatINR(row.total),
              ])}
              foot={[
                "Total",
                formatINR(data.gstTotals.taxable),
                formatINR(data.gstTotals.cgst),
                formatINR(data.gstTotals.sgst),
                formatINR(data.gstTotals.tax),
                formatINR(data.gstTotals.total),
              ]}
            />
          </ReportSection>

          <ReportSection title="By payment method">
            <ReportTable
              head={["Payment", "Bills", "Amount"]}
              numeric={[1, 2]}
              rows={data.byPayment.map((row) => [PAYMENT_LABEL[row.method], row.bills, formatINR(row.amount)])}
              foot={["Total", data.totals.bills, formatINR(data.totals.amount)]}
            />
          </ReportSection>

          <ReportSection title="Day by day">
            <ReportTable
              head={["Date", "Bills", "Discount", "GST", "Sales"]}
              numeric={[1, 2, 3, 4]}
              rows={data.days.map((day) => [formatLongDay(day.day), day.bills, formatINR(day.discount), formatINR(day.tax), formatINR(day.amount)])}
              muted={(i) => data.days[i].bills === 0}
              foot={["Total", data.totals.bills, formatINR(data.totals.discount), formatINR(data.totals.tax), formatINR(data.totals.amount)]}
            />
          </ReportSection>
        </>
      )}
    </div>
  );
}
