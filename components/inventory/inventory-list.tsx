"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import type { inferRouterOutputs } from "@trpc/server";
import { ChevronLeft, ChevronRight, PackageSearch, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { MedicineActions } from "@/components/inventory/medicine-actions";
import { MedicineFormDialog, type MedicineDialogMode } from "@/components/inventory/medicine-form-dialog";
import { StockStatusBadges } from "@/components/inventory/stock-status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatExpiry, formatINR, formatPacks, formatUnits } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";
import { inventoryFilterSchema, type InventoryFilter } from "@/lib/validations";
import type { AppRouter } from "@/server/root";

type ListItem = inferRouterOutputs<AppRouter>["inventory"]["list"]["items"][number];

const PAGE_SIZE = 25;

const FILTERS: { value: InventoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Inactive" },
];

/** Inventory table. Search, filter and page live in the URL so Back and refresh keep them. */
export function InventoryList() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("q") ?? "";
  const filter = inventoryFilterSchema.catch("all").parse(searchParams.get("filter") ?? "all");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchText, setSearchText] = useState(search);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dialog, setDialog] = useState<MedicineDialogMode | null>(null);

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
    // Search as you type, after a short pause.
    searchTimer.current = setTimeout(() => updateParams({ q: value.trim() || null, page: null }), 250);
  }

  const list = useQuery({
    ...trpc.inventory.list.queryOptions({ search: search || undefined, filter, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const data = list.data;
  const lastPage = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, generic name or barcode"
            className="pl-8"
            autoFocus
            aria-label="Search medicines"
          />
        </div>
        <Button onClick={() => setDialog({ type: "create" })}>
          <Plus /> Add medicine
        </Button>
      </div>

      <Tabs value={filter} onValueChange={(value) => updateParams({ filter: value === "all" ? null : value, page: null })}>
        <TabsList className="h-auto flex-wrap">
          {FILTERS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} className="px-2.5">
              {label}
              {data && <span className="text-xs text-muted-foreground tabular-nums">{data.counts[value]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className={cn("rounded-lg border transition-opacity", list.isFetching && !list.isPending && "opacity-60")}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead className="hidden md:table-cell">Nearest expiry</TableHead>
              <TableHead className="hidden md:table-cell text-right">MRP / pack</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isPending
              ? Array.from({ length: 8 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-9" />
                    </TableCell>
                  </TableRow>
                ))
              : data?.items.map((item) => (
                  <MedicineRow key={item.id} item={item} onEdit={() => setDialog({ type: "edit", medicine: item })} />
                ))}
          </TableBody>
        </Table>

        {list.isError && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-destructive">Couldn&apos;t load medicines: {list.error.message}</p>
            <Button variant="outline" onClick={() => list.refetch()}>
              Try again
            </Button>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <PackageSearch className="size-8" />
            <p>{search ? `No medicines match “${search}”.` : "No medicines here."}</p>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })}
            >
              <ChevronLeft /> Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {lastPage}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      <MedicineFormDialog mode={dialog} onOpenChange={(open) => !open && setDialog(null)} />
    </div>
  );
}

function MedicineRow({ item, onEdit }: { item: ListItem; onEdit: () => void }) {
  const mrp =
    item.mrpMin === null ? "—" : item.mrpMin === item.mrpMax ? formatINR(item.mrpMin) : `${formatINR(item.mrpMin)} – ${formatINR(item.mrpMax!)}`;

  return (
    <TableRow className={item.isActive ? undefined : "text-muted-foreground"}>
      <TableCell>
        <Link href={`/inventory/${item.id}`} className="font-medium hover:underline">
          {item.name}
        </Link>
        {item.genericName && <div className="text-xs text-muted-foreground">{item.genericName}</div>}
      </TableCell>
      <TableCell className="hidden lg:table-cell">{item.category ?? "—"}</TableCell>
      <TableCell>
        <div className="tabular-nums">{formatUnits(item.sellableStock, item.unitLabel)}</div>
        {item.packSize > 1 && <div className="text-xs text-muted-foreground">{formatPacks(item.sellableStock, item)}</div>}
        {item.expiredStock > 0 && (
          <div className="text-xs text-red-700 dark:text-red-400">+{formatUnits(item.expiredStock, item.unitLabel)} expired</div>
        )}
      </TableCell>
      <TableCell className={cn("hidden md:table-cell", item.expiringSoonStock > 0 && "font-medium text-orange-700 dark:text-orange-400")}>
        {item.nearestExpiry ? formatExpiry(item.nearestExpiry) : "—"}
      </TableCell>
      <TableCell className="hidden md:table-cell text-right tabular-nums">{mrp}</TableCell>
      <TableCell>
        <StockStatusBadges {...item} />
      </TableCell>
      <TableCell>
        <MedicineActions medicine={item} onEdit={onEdit} />
      </TableCell>
    </TableRow>
  );
}
