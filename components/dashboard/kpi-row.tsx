import { cn } from "cn";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDayRange, formatINR, percentChange, plural } from "@/lib/format";
import type { getDashboard } from "@/services/dashboard.service";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

/**
 * Headline numbers. Today's sales is the one hero figure; week and month are regular stat tiles.
 * Values use proportional figures (no tabular-nums) at display size.
 */
export function KpiRow({ data }: { data: Dashboard }) {
  const change = percentChange(data.today.amount, data.yesterday.amount);
  const ChangeIcon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardDescription>Today&apos;s sales · {formatDayRange(data.today.date, data.today.date)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="font-heading text-5xl leading-none font-semibold">{formatINR(data.today.amount)}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              {data.today.bills} {plural("bill", data.today.bills)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                // Sales going up is good: direction × "up is good". The arrow carries it too, not colour alone.
                change.direction === "up" && "text-emerald-700 dark:text-emerald-400",
                change.direction === "down" && "text-red-700 dark:text-red-400",
              )}
            >
              <ChangeIcon className="size-4" aria-hidden />
              {change.label ?? (data.yesterday.bills === 0 ? "No sales yesterday" : "")}
            </span>
            <span>vs yesterday ({formatINR(data.yesterday.amount)})</span>
          </p>
        </CardContent>
      </Card>
      <StatTile label="This week" sublabel="Since Monday" amount={data.week.amount} bills={data.week.bills} />
      <StatTile label="This month" sublabel="Since the 1st" amount={data.month.amount} bills={data.month.bills} />
    </div>
  );
}

function StatTile({ label, sublabel, amount, bills }: { label: string; sublabel: string; amount: string; bills: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {label} · {sublabel}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold">{formatINR(amount)}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {bills} {plural("bill", bills)}
      </CardContent>
    </Card>
  );
}
