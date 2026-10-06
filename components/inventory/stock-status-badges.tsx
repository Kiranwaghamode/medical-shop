import { Badge } from "@/components/ui/badge";
import type { StockStatus } from "@/lib/inventory-status";

const STATUS: Record<StockStatus, { label: string; className: string }> = {
  IN_STOCK: { label: "In stock", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  LOW_STOCK: { label: "Low stock", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  OUT_OF_STOCK: { label: "Out of stock", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  INACTIVE: { label: "Inactive", className: "bg-muted text-muted-foreground" },
};

/** Main stock status, plus warnings for stock that is expiring soon or already expired. */
export function StockStatusBadges({
  status,
  expiringSoonStock,
  expiredStock,
}: {
  status: StockStatus;
  expiringSoonStock: number;
  expiredStock: number;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge className={STATUS[status].className}>{STATUS[status].label}</Badge>
      {expiringSoonStock > 0 && (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">Expiring soon</Badge>
      )}
      {expiredStock > 0 && (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Expired stock</Badge>
      )}
    </div>
  );
}
