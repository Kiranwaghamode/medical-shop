"use client";

import { cn } from "cn";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { Segmented } from "@/components/pos/segmented";
import type { Product } from "@/components/pos/product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Allocation, CartItem, Shortage } from "@/lib/cart";
import { formatExpiry, formatINR, formatPacks, formatUnits, plural } from "@/lib/format";
import { fromPaise, toPaise, type Bill } from "@/lib/pricing";

const AUTO = "auto";

export function CartTable({
  items,
  products,
  allocations,
  shortages,
  grossBill,
  onQuantity,
  onSoldBy,
  onBatch,
  onRemove,
}: {
  items: CartItem[];
  products: Map<string, Product>;
  allocations: Allocation[];
  shortages: Shortage[];
  // Bill without discount: line amounts as shown in the cart.
  grossBill: Bill;
  onQuantity: (key: string, quantity: number) => void;
  onSoldBy: (key: string) => void;
  onBatch: (key: string, batchId: string | null) => void;
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        <ShoppingCart className="size-8" />
        <p>The cart is empty. Search for a medicine or scan a barcode to start.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Medicine</TableHead>
            <TableHead>Sold as</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead className="w-36">Qty</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const product = products.get(item.medicineId);
            if (!product) return null;
            const portions = allocations.flatMap((a, i) => (a.itemKey === item.key ? [{ allocation: a, line: grossBill.lines[i] }] : []));
            const shortage = shortages.find((s) => s.itemKey === item.key);
            const amount = fromPaise(portions.reduce((sum, p) => sum + toPaise(p.line.lineTotal), 0n));
            const prices = [...new Set(portions.map((p) => p.line.unitPrice))];
            const itemWord = item.soldBy === "PACK" ? product.packLabel : product.unitLabel;
            const batchName = (id: string) => product.batches.find((b) => b.id === id)?.batchNumber ?? "?";

            return (
              <TableRow key={item.key} className={cn(shortage && "bg-red-50/60 dark:bg-red-950/20")}>
                <TableCell className="text-muted-foreground tabular-nums">{index + 1}</TableCell>
                <TableCell>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {portions.length === 1 && `From ${batchName(portions[0].allocation.batchId)}`}
                    {portions.length > 1 &&
                      `Split: ${portions.map((p) => `${batchName(p.allocation.batchId)} × ${p.allocation.quantity}`).join(" + ")}`}
                  </div>
                  {shortage && (
                    <div className="text-xs font-medium text-destructive">
                      Only {item.quantity - shortage.missing} {plural(itemWord, item.quantity - shortage.missing)} available
                      {item.soldBy === "PACK" && product.packSize > 1 && " as whole strips — try selling loose"}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {product.packSize > 1 ? (
                    <Segmented
                      size="sm"
                      label={`Sell ${product.name} as`}
                      value={item.soldBy}
                      onChange={(value) => value !== item.soldBy && onSoldBy(item.key)}
                      options={[
                        { value: "PACK", label: capitalize(product.packLabel) },
                        { value: "UNIT", label: capitalize(product.unitLabel) },
                      ]}
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground capitalize">{product.packLabel}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Select value={item.batchId ?? AUTO} onValueChange={(value) => onBatch(item.key, value === AUTO ? null : value)}>
                    <SelectTrigger size="sm" className="w-40" aria-label={`Batch for ${product.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>Auto (earliest expiry)</SelectItem>
                      {product.batches.map((batch) => (
                        <SelectItem key={batch.id} value={batch.id}>
                          {batch.batchNumber} · {formatExpiry(batch.expiryDate)} ·{" "}
                          {product.packSize > 1 ? formatPacks(batch.quantity, product) : formatUnits(batch.quantity, product.unitLabel)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label="Decrease quantity"
                      disabled={item.quantity <= 1}
                      onClick={() => onQuantity(item.key, item.quantity - 1)}
                    >
                      <Minus />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10);
                        if (Number.isInteger(value) && value >= 1) onQuantity(item.key, value);
                      }}
                      onFocus={(event) => event.target.select()}
                      className="h-8 w-14 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label={`Quantity of ${product.name}`}
                    />
                    <Button variant="outline" size="icon-sm" aria-label="Increase quantity" onClick={() => onQuantity(item.key, item.quantity + 1)}>
                      <Plus />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {prices.length ? prices.map((p) => formatINR(p)).join(" / ") : "—"}
                  <div className="text-xs text-muted-foreground">per {itemWord}</div>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatINR(amount)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${product.name}`} onClick={() => onRemove(item.key)}>
                    <X />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
