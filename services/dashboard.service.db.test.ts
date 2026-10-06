// Dashboard figures against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { getAlertCount, getDashboard } from "@/services/dashboard.service";

// "Now" for the sales figures: Tuesday 15 Jan 2030, 11:30 IST. (Stock alerts use the real today.)
const NOW = new Date("2030-01-15T06:00:00Z");
let shopId: string;
let otherShopId: string;
let invoice = 0;

async function sale(shop: string, userId: string, createdAt: string, total: string, paymentMethod: "CASH" | "UPI" | "CARD" = "CASH") {
  await db.sale.create({
    data: {
      shopId: shop,
      userId,
      invoiceNumber: `INV-2029-30-${String(++invoice).padStart(6, "0")}`,
      financialYear: "2029-30",
      subtotal: total,
      discount: "0",
      taxTotal: "0",
      total,
      paymentMethod,
      createdAt: new Date(createdAt),
    },
  });
}

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST dashboard shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST dashboard other" } })).id;
  const userId = (await db.user.create({ data: { clerkId: `test_dash_${shopId}`, email: "d@test.dev", shopId } })).id;
  const otherUserId = (await db.user.create({ data: { clerkId: `test_dash_${otherShopId}`, email: "o@test.dev", shopId: otherShopId } })).id;

  await sale(shopId, userId, "2029-12-30T06:00:00Z", "1000.00"); // last month
  await sale(shopId, userId, "2030-01-03T06:00:00Z", "40.00"); // this month, last week
  await sale(shopId, userId, "2030-01-14T06:00:00Z", "150.00", "UPI"); // yesterday (Monday) — this week
  await sale(shopId, userId, "2030-01-14T18:00:00Z", "50.00"); // 23:30 IST yesterday
  await sale(shopId, userId, "2030-01-14T18:40:00Z", "100.00", "UPI"); // 00:10 IST today
  await sale(shopId, userId, "2030-01-15T04:00:00Z", "75.50", "CARD"); // today
  await sale(shopId, userId, "2030-01-15T05:00:00Z", "24.50"); // today
  await sale(otherShopId, otherUserId, "2030-01-15T05:00:00Z", "9999.00"); // another shop, today

  // Stock alerts (relative to the real today).
  const today = todayInIndia();
  const med = (name: string, minimumStock: number, batches: { quantity: number; days: number }[], isActive = true) =>
    db.medicine.create({
      data: {
        shopId,
        name,
        gstRate: "5",
        packSize: 10,
        minimumStock,
        isActive,
        batches: {
          create: batches.map((b, i) => ({
            batchNumber: `B${i}`,
            expiryDate: addDays(today, b.days),
            quantity: b.quantity,
            mrp: "10.00",
            purchasePrice: "7.00",
            sellingPrice: "10.00",
          })),
        },
      },
    });
  await med("Alpha Expired", 0, [{ quantity: 30, days: -5 }, { quantity: 100, days: 300 }]);
  await med("Beta Expired More", 0, [{ quantity: 80, days: -40 }]);
  await med("Gamma Expiring", 0, [{ quantity: 20, days: 10 }]);
  await med("Delta Expiring Later", 0, [{ quantity: 20, days: 25 }]);
  await med("Epsilon Low", 100, [{ quantity: 60, days: 300 }]);
  await med("Zeta Very Low", 100, [{ quantity: 10, days: 300 }]);
  await med("Eta Out", 10, [{ quantity: 0, days: 300 }]);
  await med("Theta Retired", 100, [{ quantity: 1, days: -5 }], false); // inactive: never alerted
});

afterAll(async () => {
  const shops = { in: [shopId, otherShopId] };
  await db.sale.deleteMany({ where: { shopId: shops } });
  await db.inventoryBatch.deleteMany({ where: { medicine: { shopId: shops } } });
  await db.medicine.deleteMany({ where: { shopId: shops } });
  await db.user.deleteMany({ where: { shopId: shops } });
  await db.shop.deleteMany({ where: { id: shops } });
  await db.$disconnect();
});

describe("getDashboard", () => {
  let dashboard: Awaited<ReturnType<typeof getDashboard>>;
  beforeAll(async () => {
    dashboard = await getDashboard(shopId, NOW);
  });

  it("totals today, yesterday, this week and this month by the Indian calendar", () => {
    expect(dashboard.today).toEqual({ date: "2030-01-15", amount: "200.00", bills: 3 }); // includes 00:10 IST
    expect(dashboard.yesterday).toEqual({ amount: "200.00", bills: 2 }); // includes 23:30 IST
    expect(dashboard.week).toEqual({ amount: "400.00", bills: 5 }); // Monday 14th → today
    expect(dashboard.month).toEqual({ amount: "440.00", bills: 6 }); // 1st → today
  });

  it("splits today's sales by payment method", () => {
    expect(dashboard.paymentSplit).toEqual([
      { method: "CASH", amount: "24.50", bills: 1 },
      { method: "UPI", amount: "100.00", bills: 1 },
      { method: "CARD", amount: "75.50", bills: 1 },
    ]);
  });

  it("gives 30 days for the chart, oldest first, with zero on days without sales", () => {
    expect(dashboard.chart).toHaveLength(30);
    expect(dashboard.chart[0].day).toBe("2029-12-17");
    expect(dashboard.chart.at(-1)).toEqual({ day: "2030-01-15", amount: "200.00", bills: 3 });
    expect(dashboard.chart.at(-2)).toEqual({ day: "2030-01-14", amount: "200.00", bills: 2 });
    expect(dashboard.chart.find((d) => d.day === "2029-12-30")).toEqual({ day: "2029-12-30", amount: "1000.00", bills: 1 });
    expect(dashboard.chart.find((d) => d.day === "2030-01-10")).toEqual({ day: "2030-01-10", amount: "0.00", bills: 0 });
    const total = dashboard.chart.reduce((sum, d) => sum + Number(d.amount), 0);
    expect(total.toFixed(2)).toBe("1440.00"); // every sale of this shop, none from the other
  });

  it("lists the five most recent sales, newest first", () => {
    expect(dashboard.recentSales.map((s) => s.total)).toEqual(["24.50", "75.50", "100.00", "50.00", "150.00"]);
  });

  it("raises stock alerts with the same rules as the inventory filters, most urgent first", () => {
    const names = (key: keyof typeof dashboard.alerts) => dashboard.alerts[key].items.map((i) => i.name);
    expect(names("expired")).toEqual(["Beta Expired More", "Alpha Expired"]);
    expect(names("expiring")).toEqual(["Gamma Expiring", "Delta Expiring Later"]);
    expect(names("low")).toEqual(["Zeta Very Low", "Epsilon Low"]);
    expect(names("out")).toEqual(["Beta Expired More", "Eta Out"]); // only expired stock left = nothing to sell
    expect(dashboard.alerts.expired.count).toBe(2);
    expect(Object.values(dashboard.alerts).flatMap((a) => a.items.map((i) => i.name))).not.toContain("Theta Retired");
  });

  it("counts each medicine needing attention once, for the sidebar badge", async () => {
    // Alpha, Beta (expired AND out), Gamma, Delta, Epsilon, Zeta, Eta — not the inactive Theta.
    expect(await getAlertCount(shopId)).toBe(7);
  });

  it("returns zeros for a shop with no sales", async () => {
    const empty = await getDashboard(otherShopId, new Date("2031-06-01T06:00:00Z"));
    expect(empty.today).toMatchObject({ amount: "0.00", bills: 0 });
    expect(empty.chart.every((d) => d.amount === "0.00")).toBe(true);
  });
});
