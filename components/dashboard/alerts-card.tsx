import { cn } from "cn";
import { AlertTriangle, ArrowRight, CalendarClock, CircleCheck, PackageX, TrendingDown, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatExpiry, formatUnits } from "@/lib/format";
import type { getDashboard } from "@/services/dashboard.service";

type Alerts = Awaited<ReturnType<typeof getDashboard>>["alerts"];
type AlertItem = Alerts["expired"]["items"][number];

// Status colours are reserved for state and always come with an icon + label, never colour alone.
const SECTIONS: {
  key: keyof Alerts;
  title: string;
  icon: LucideIcon;
  tone: string;
  filter: string;
  detail: (item: AlertItem) => string;
}[] = [
  {
    key: "expired",
    title: "Expired stock on the shelf",
    icon: AlertTriangle,
    tone: "text-red-700 dark:text-red-400",
    filter: "expired",
    detail: (m) => `${formatUnits(m.expiredStock, m.unitLabel)} to remove`,
  },
  {
    key: "expiring",
    title: "Expiring within 30 days",
    icon: CalendarClock,
    tone: "text-orange-700 dark:text-orange-400",
    filter: "expiring",
    detail: (m) => `${formatUnits(m.expiringSoonStock, m.unitLabel)}${m.nearestExpiry ? ` · ${formatExpiry(m.nearestExpiry)}` : ""}`,
  },
  {
    key: "low",
    title: "Low stock",
    icon: TrendingDown,
    tone: "text-amber-700 dark:text-amber-400",
    filter: "low",
    detail: (m) => `${formatUnits(m.sellableStock, m.unitLabel)} left · alert below ${formatUnits(m.minimumStock, m.unitLabel)}`,
  },
  {
    key: "out",
    title: "Out of stock",
    icon: PackageX,
    tone: "text-red-700 dark:text-red-400",
    filter: "out",
    detail: () => "Nothing sellable",
  },
];

/** Stock problems, most urgent first, each linking to the matching inventory filter. */
export function AlertsCard({ alerts }: { alerts: Alerts }) {
  const active = SECTIONS.filter((section) => alerts[section.key].count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock alerts</CardTitle>
        <CardDescription>Checked against today&apos;s date. Inactive medicines are not included.</CardDescription>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <p className="flex items-center gap-2 py-4 text-muted-foreground">
            <CircleCheck className="size-5 text-emerald-600" aria-hidden /> All good — no expired, expiring, low or out-of-stock medicines.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {active.map(({ key, title, icon: Icon, tone, filter, detail }) => {
              const { count, items } = alerts[key];
              return (
                <section key={key} className="flex flex-col gap-2">
                  <Link href={`/inventory?filter=${filter}`} className="group flex items-center justify-between gap-2">
                    <h3 className={cn("flex items-center gap-2 font-medium", tone)}>
                      <Icon className="size-4" aria-hidden />
                      {title}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{count}</span>
                    </h3>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                      View <ArrowRight className="size-3" aria-hidden />
                    </span>
                  </Link>
                  <ul className="flex flex-col gap-1 text-sm">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3">
                        <Link href={`/inventory/${item.id}`} className="truncate hover:underline">
                          {item.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{detail(item)}</span>
                      </li>
                    ))}
                    {count > items.length && <li className="text-xs text-muted-foreground">and {count - items.length} more</li>}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
