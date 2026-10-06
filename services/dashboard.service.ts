import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { indiaDayStart, indiaIsoDate, salesPeriodRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { matchesFilter, loadMedicineSummaries, type MedicineListItem } from "@/services/inventory.service";

// Every figure is for the caller's shop only. Days are Indian calendar days (lib/dates.ts).

const CHART_DAYS = 30;
const ALERT_LIST_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const money = (value: Prisma.Decimal | null | undefined) => (value ?? new Prisma.Decimal(0)).toFixed(2);

async function salesTotal(shopId: string, range: { start: Date; end: Date }) {
  const result = await db.sale.aggregate({
    where: { shopId, createdAt: { gte: range.start, lt: range.end } },
    _count: true,
    _sum: { total: true },
  });
  return { amount: money(result._sum.total), bills: result._count };
}

type AlertItem = Pick<MedicineListItem, "id" | "name" | "unitLabel" | "packLabel" | "packSize" | "minimumStock" | "sellableStock" | "expiredStock" | "expiringSoonStock" | "nearestExpiry">;

const alertItem = (m: MedicineListItem): AlertItem => ({
  id: m.id,
  name: m.name,
  unitLabel: m.unitLabel,
  packLabel: m.packLabel,
  packSize: m.packSize,
  minimumStock: m.minimumStock,
  sellableStock: m.sellableStock,
  expiredStock: m.expiredStock,
  expiringSoonStock: m.expiringSoonStock,
  nearestExpiry: m.nearestExpiry,
});

/** Everything the dashboard shows, in one call. `now` is only for tests. */
export async function getDashboard(shopId: string, now: Date = new Date()) {
  const today = indiaIsoDate(now);
  const yesterday = indiaIsoDate(new Date(indiaDayStart(today).getTime() - DAY_MS));
  const todayRange = salesPeriodRange("today", {}, now)!;
  const chartFrom = indiaIsoDate(new Date(indiaDayStart(today).getTime() - (CHART_DAYS - 1) * DAY_MS));

  const [todaySales, yesterdaySales, weekSales, monthSales, payments, daily, recent, medicines] = await Promise.all([
    salesTotal(shopId, todayRange),
    salesTotal(shopId, salesPeriodRange("custom", { from: yesterday, to: yesterday }, now)!),
    salesTotal(shopId, salesPeriodRange("week", {}, now)!),
    salesTotal(shopId, salesPeriodRange("month", {}, now)!),
    db.sale.groupBy({
      by: ["paymentMethod"],
      where: { shopId, createdAt: { gte: todayRange.start, lt: todayRange.end } },
      _count: true,
      _sum: { total: true },
    }),
    // Sales per Indian calendar day, summed in the database.
    db.$queryRaw<{ day: string; amount: string; bills: number }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
             SUM("total")::text AS amount,
             COUNT(*)::int AS bills
      FROM "Sale"
      WHERE "shopId" = ${shopId}
        AND "createdAt" >= ${indiaDayStart(chartFrom)}
        AND "createdAt" < ${todayRange.end}
      GROUP BY 1
    `,
    db.sale.findMany({
      where: { shopId },
      orderBy: [{ createdAt: "desc" }, { invoiceNumber: "desc" }],
      take: 5,
      select: { id: true, invoiceNumber: true, createdAt: true, customerName: true, paymentMethod: true, total: true },
    }),
    loadMedicineSummaries(shopId),
  ]);

  // One entry per day, oldest first, with zero for days without sales.
  const byDay = new Map(daily.map((row) => [row.day, row]));
  const chart = Array.from({ length: CHART_DAYS }, (_, i) => {
    const day = indiaIsoDate(new Date(indiaDayStart(chartFrom).getTime() + i * DAY_MS));
    const row = byDay.get(day);
    return { day, amount: row ? new Prisma.Decimal(row.amount).toFixed(2) : "0.00", bills: row ? Number(row.bills) : 0 };
  });

  const paymentSplit = (["CASH", "UPI", "CARD"] as const).map((method) => {
    const row = payments.find((p) => p.paymentMethod === method);
    return { method, amount: money(row?._sum.total), bills: row?._count ?? 0 };
  });

  // Alerts, using exactly the same rules as the inventory filters.
  const pick = (filter: "low" | "out" | "expiring" | "expired", sort: (a: MedicineListItem, b: MedicineListItem) => number) => {
    const matching = medicines.filter((m) => matchesFilter(m, filter)).sort(sort);
    return { count: matching.length, items: matching.slice(0, ALERT_LIST_SIZE).map(alertItem) };
  };

  return {
    today: { ...todaySales, date: today },
    yesterday: yesterdaySales,
    week: weekSales,
    month: monthSales,
    paymentSplit,
    chart,
    recentSales: recent.map((sale) => ({ ...sale, total: money(sale.total) })),
    alerts: {
      // Most units to remove from the shelf first.
      expired: pick("expired", (a, b) => b.expiredStock - a.expiredStock),
      // Soonest expiry first.
      expiring: pick("expiring", (a, b) => (a.nearestExpiry?.getTime() ?? 0) - (b.nearestExpiry?.getTime() ?? 0)),
      // Furthest below the minimum first.
      low: pick("low", (a, b) => a.sellableStock / a.minimumStock - b.sellableStock / b.minimumStock),
      out: pick("out", (a, b) => a.name.localeCompare(b.name)),
    },
  };
}

/** Medicines needing attention (expired stock, expiring soon, low or out of stock), each counted once. For the sidebar badge. */
export async function getAlertCount(shopId: string): Promise<number> {
  const medicines = await loadMedicineSummaries(shopId);
  return medicines.filter((m) => (["expired", "expiring", "low", "out"] as const).some((filter) => matchesFilter(m, filter))).length;
}
