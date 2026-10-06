"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, ReceiptText, Search, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, formatDayRange, formatINR } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";

const PAGE_SIZE = 25;

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

const PAYMENT_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card" } as const;
type Payment = keyof typeof PAYMENT_LABEL;

/** Sales history. Search, period, dates, payment and page live in the URL so Back and refresh keep them. */
export function SalesHistory() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("q") ?? "";
  const period: Period = PERIODS.some((p) => p.value === searchParams.get("period")) ? (searchParams.get("period") as Period) : "today";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const payment = (["CASH", "UPI", "CARD"] as const).find((p) => p === searchParams.get("payment"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchText, setSearchText] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function updateParams(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function onSearchChange(value: string) {
    setSearchText(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => updateParams({ q: value.trim() || null, page: null }), 250);
  }

  // A custom range is only searched once both dates are chosen and in order.
  const customError = period === "custom" && from && to && from > to ? "The end date is before the start date." : null;
  const ready = period !== "custom" || (!!from && !!to && !customError);

  const list = useQuery({
    ...trpc.sales.list.queryOptions({
      search: search || undefined,
      period,
      from: period === "custom" ? from : undefined,
      to: period === "custom" ? to : undefined,
      paymentMethod: payment,
      page,
      pageSize: PAGE_SIZE,
    }),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const data = ready ? list.data : undefined;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const rangeLabel = data?.range ? formatDayRange(data.range.from, data.range.to) : data ? "All time" : "";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search invoice no., customer or phone"
            className="pl-8"
            aria-label="Search sales"
          />
        </div>
        <Button asChild>
          <Link href="/sales/new">
            <ShoppingCart /> New sale
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={period} onValueChange={(value) => updateParams({ period: value === "today" ? null : value, page: null })}>
          <TabsList>
            {PERIODS.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="px-2.5">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {period === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => updateParams({ from: event.target.value || null, page: null })}
              className="h-8 w-40"
              aria-label="From date"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => updateParams({ to: event.target.value || null, page: null })}
              className="h-8 w-40"
              aria-label="To date"
            />
          </div>
        )}

        <Select value={payment ?? "ALL"} onValueChange={(value) => updateParams({ payment: value === "ALL" ? null : value, page: null })}>
          <SelectTrigger size="sm" className="w-36" aria-label="Payment method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All payments</SelectItem>
            {(Object.keys(PAYMENT_LABEL) as Payment[]).map((method) => (
              <SelectItem key={method} value={method}>
                {PAYMENT_LABEL[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {period === "custom" && !ready && (
        <p className={cn("text-sm", customError ? "text-destructive" : "text-muted-foreground")}>
          {customError ?? "Choose a start and end date."}
        </p>
      )}

      {ready && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title={`Bills · ${rangeLabel}`} value={data ? String(data.summary.bills) : null} />
          <SummaryCard title="Sales amount" value={data ? formatINR(data.summary.amount) : null} />
          <SummaryCard title="Discount given" value={data ? formatINR(data.summary.discount) : null} />
          <SummaryCard title="GST included" value={data ? formatINR(data.summary.tax) : null} />
        </div>
      )}

      {ready && (
        <div className={cn("rounded-lg border transition-opacity", list.isFetching && !list.isPending && "opacity-60")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date & time</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Lines</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6" />
                      </TableCell>
                    </TableRow>
                  ))
                : data?.sales.map((sale) => (
                    <TableRow
                      key={sale.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/sales/${sale.id}`)}
                    >
                      <TableCell>
                        <Link href={`/sales/${sale.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {sale.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(sale.createdAt)}</TableCell>
                      <TableCell>
                        {sale.customerName ?? <span className="text-muted-foreground">Walk-in</span>}
                        {sale.customerPhone && <div className="text-xs text-muted-foreground">{sale.customerPhone}</div>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums">{sale.lineCount}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PAYMENT_LABEL[sale.paymentMethod]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatINR(sale.total)}</TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>

          {list.isError && (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <p className="text-destructive">Couldn&apos;t load sales: {list.error.message}</p>
              <Button variant="outline" onClick={() => list.refetch()}>
                Try again
              </Button>
            </div>
          )}

          {data && data.sales.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
              <ReceiptText className="size-8" />
              <p>{search ? `No sales match “${search}” in this period.` : "No sales in this period."}</p>
            </div>
          )}
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })}>
              <ChevronLeft /> Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {lastPage}
            </span>
            <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => updateParams({ page: String(page + 1) })}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string | null }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{value ?? <Skeleton className="h-7 w-24" />}</CardTitle>
      </CardHeader>
    </Card>
  );
}
