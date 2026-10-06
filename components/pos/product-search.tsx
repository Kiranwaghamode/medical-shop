"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { cn } from "cn";
import { ScanBarcode, Search } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatINR, formatPacks, formatUnits } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";
import type { AppRouter } from "@/server/root";

export type Product = inferRouterOutputs<AppRouter>["sales"]["searchProducts"]["products"][number];

const LIMIT = 8;

/**
 * Search box for the counter. Type and pick with ↑ ↓ Enter, or click. A barcode scanner types the code and presses
 * Enter, which adds the exact match straight away (even if the results haven't caught up with the typing yet).
 */
export function ProductSearch({ inputRef, onAdd }: { inputRef: RefObject<HTMLInputElement | null>; onAdd: (product: Product) => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const results = useQuery({
    ...trpc.sales.searchProducts.queryOptions({ query, limit: LIMIT }),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
  const products = query ? (results.data?.products ?? []) : [];

  function onChange(value: string) {
    setText(value);
    setHighlight(0);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuery(value.trim()), 150);
  }

  function reset() {
    clearTimeout(timer.current);
    setText("");
    setQuery("");
    setHighlight(0);
  }

  function add(product: Product | undefined) {
    if (!product) return;
    if (product.sellableStock === 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    onAdd(product);
    reset();
    inputRef.current?.focus();
  }

  async function onEnter() {
    const current = text.trim();
    if (!current) return;
    // Results may lag behind fast typing (e.g. a scanner): fetch for exactly what's in the box.
    const data =
      current === query && results.data
        ? results.data
        : await queryClient.fetchQuery(trpc.sales.searchProducts.queryOptions({ query: current, limit: LIMIT }));
    if (data.barcodeMatchId) return add(data.products.find((p) => p.id === data.barcodeMatchId));
    if (data.products.length === 0) return toast.error(`No medicine matches “${current}”`);
    add(data.products[current === query ? highlight : 0]);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(products.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      void onEnter();
    } else if (event.key === "Escape") {
      reset();
    }
  }

  const open = text.trim().length > 0 && query.length > 0;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search medicine or scan barcode  (F2)"
        className="h-11 pl-10 text-base"
        autoFocus
        autoComplete="off"
        aria-label="Search medicine or scan barcode"
        aria-expanded={open}
        aria-controls="pos-search-results"
        role="combobox"
      />
      <ScanBarcode className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground" />

      {open && (
        <ul
          id="pos-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
        >
          {products.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">
              {results.isFetching ? "Searching…" : `No medicine matches “${query}”`}
            </li>
          ) : (
            products.map((product, index) => {
              const first = product.batches[0];
              const outOfStock = product.sellableStock === 0;
              return (
                <li
                  key={product.id}
                  role="option"
                  aria-selected={index === highlight}
                  aria-disabled={outOfStock}
                  onMouseEnter={() => setHighlight(index)}
                  // mousedown (not click) so the input doesn't lose focus first.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    add(product);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 rounded-md px-3 py-2",
                    index === highlight && "bg-accent",
                    outOfStock && "cursor-not-allowed opacity-60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{product.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[product.genericName, product.manufacturer].filter(Boolean).join(" · ") || " "}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-right text-sm">
                    {outOfStock ? (
                      <Badge className="bg-red-100 text-red-800">Out of stock</Badge>
                    ) : (
                      <>
                        {first.isExpiringSoon && <Badge className="bg-orange-100 text-orange-800">Expiring soon</Badge>}
                        <div>
                          <div className="tabular-nums">
                            {formatINR(first.sellingPrice)}/{product.packLabel}
                            {first.unitSellingPrice && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {formatINR(first.unitSellingPrice)}/{product.unitLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {product.packSize > 1 ? formatPacks(product.sellableStock, product) : formatUnits(product.sellableStock, product.unitLabel)}{" "}
                            in stock
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
