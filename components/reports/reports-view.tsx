"use client";

import { Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/pos/segmented";
import { ExpiryReport } from "@/components/reports/expiry-report";
import { SalesReport } from "@/components/reports/sales-report";
import { StockReport } from "@/components/reports/stock-report";
import { TopMedicinesReport } from "@/components/reports/top-medicines-report";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReportRangeInput } from "@/lib/validations";

const TABS = [
  { value: "sales", label: "Sales" },
  { value: "top", label: "Top medicines" },
  { value: "stock", label: "Stock" },
  { value: "expiry", label: "Expiry" },
] as const;
type Tab = (typeof TABS)[number]["value"];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "custom", label: "Custom" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

/** Reports. The tab and every filter live in the URL, so a report can be refreshed, bookmarked or shared. */
export function ReportsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: Tab = TABS.find((t) => t.value === searchParams.get("tab"))?.value ?? "sales";
  const period: Period = PERIODS.find((p) => p.value === searchParams.get("period"))?.value ?? "month";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const sortBy = searchParams.get("sort") === "quantity" ? "quantity" : "amount";
  const withinDays = ([30, 60, 90] as const).find((d) => String(d) === searchParams.get("within")) ?? 90;

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // A custom range is only reported once both dates are chosen and in order.
  const customError = period === "custom" && from && to && from > to ? "The end date is before the start date." : null;
  const rangeReady = period !== "custom" || (!!from && !!to && !customError);
  const range: ReportRangeInput = period === "custom" ? { period, from, to } : { period };
  const usesRange = tab === "sales" || tab === "top";

  return (
    <div className="flex flex-col gap-5 p-6 print:gap-4 print:p-0">
      {/* Reports print on A4 portrait. */}
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>

      <Tabs value={tab} onValueChange={(value) => updateParams({ tab: value === "sales" ? null : value })} className="print:hidden">
        <TabsList>
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="px-3">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* One filter row, above the report it scopes. */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {usesRange && (
          <>
            <Segmented
              label="Period"
              value={period}
              onChange={(value) => updateParams({ period: value === "month" ? null : value })}
              options={PERIODS.map(({ value, label }) => ({ value, label }))}
            />
            {period === "custom" && (
              <div className="flex items-center gap-2 text-sm">
                <Input type="date" value={from} max={to || undefined} onChange={(e) => updateParams({ from: e.target.value || null })} className="h-8 w-40" aria-label="From date" />
                <span className="text-muted-foreground">to</span>
                <Input type="date" value={to} min={from || undefined} onChange={(e) => updateParams({ to: e.target.value || null })} className="h-8 w-40" aria-label="To date" />
              </div>
            )}
          </>
        )}
        {tab === "top" && (
          <Segmented
            label="Rank by"
            value={sortBy}
            onChange={(value) => updateParams({ sort: value === "amount" ? null : value })}
            options={[
              { value: "amount", label: "By sales" },
              { value: "quantity", label: "By quantity" },
            ]}
          />
        )}
        {tab === "expiry" && (
          <Segmented
            label="Expiring within"
            value={String(withinDays) as "30" | "60" | "90"}
            onChange={(value) => updateParams({ within: value === "90" ? null : value })}
            options={[
              { value: "30", label: "30 days" },
              { value: "60", label: "60 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        )}
        {tab === "stock" && <p className="text-sm text-muted-foreground">Current stock, as of today.</p>}
        <Button variant="outline" className="ml-auto" onClick={() => window.print()} disabled={usesRange && !rangeReady}>
          <Printer /> Print
        </Button>
      </div>

      {usesRange && !rangeReady ? (
        <p className={customError ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {customError ?? "Choose a start and end date."}
        </p>
      ) : tab === "sales" ? (
        <SalesReport range={range} />
      ) : tab === "top" ? (
        <TopMedicinesReport range={range} sortBy={sortBy} />
      ) : tab === "stock" ? (
        <StockReport />
      ) : (
        <ExpiryReport withinDays={withinDays} />
      )}
    </div>
  );
}
