import { cn } from "cn";
import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A headline number for a report (stat tile): label, value, optional note. */
export function ReportTile({ label, value, note, tone }: { label: string; value: string | null | undefined; note?: string; tone?: "danger" | "warning" }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl font-semibold",
            tone === "danger" && "text-red-700 dark:text-red-400",
            tone === "warning" && "text-orange-700 dark:text-orange-400",
          )}
        >
          {value ?? <Skeleton className="h-7 w-24" />}
        </CardTitle>
        {note && <CardDescription className="text-xs">{note}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

/** A titled report table section. */
export function ReportSection({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-base font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="overflow-x-auto rounded-lg border print:overflow-visible">{children}</div>
    </section>
  );
}

/** Plain, compact report table. `numeric` columns are right-aligned with aligned digits. */
export function ReportTable({
  head,
  rows,
  foot,
  numeric = [],
  muted,
}: {
  head: string[];
  rows: ReactNode[][];
  foot?: ReactNode[];
  numeric?: number[];
  // Rows to show greyed out (e.g. days without sales).
  muted?: (index: number) => boolean;
}) {
  // Number columns shrink to their content, so text columns (medicine names) get the rest of the width.
  const align = (i: number) => (numeric.includes(i) ? "w-px whitespace-nowrap text-right tabular-nums" : "text-left");
  return (
    <table className="w-full text-sm print:text-xs">
      <thead className="bg-muted/50 text-muted-foreground">
        <tr>
          {head.map((cell, i) => (
            <th key={i} className={cn("px-3 py-2 font-medium whitespace-nowrap print:px-2 print:py-1.5", align(i))}>
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">
              Nothing to show for this period.
            </td>
          </tr>
        ) : (
          rows.map((row, r) => (
            <tr key={r} className={cn("border-t break-inside-avoid", muted?.(r) && "text-muted-foreground")}>
              {row.map((cell, i) => (
                <td key={i} className={cn("px-3 py-1.5 print:px-2 print:py-1", align(i))}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {foot && rows.length > 0 && (
        <tfoot className="border-t-2 font-semibold">
          <tr>
            {foot.map((cell, i) => (
              <td key={i} className={cn("px-3 py-2 print:px-2 print:py-1.5", align(i))}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
