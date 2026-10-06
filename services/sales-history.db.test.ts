// Sales history (listSales) against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { salesListSchema } from "@/lib/validations";
import { listSales } from "@/services/sales.service";

let shopId: string;
let otherShopId: string;
let invoice = 0;

async function sale(
  shop: string,
  userId: string,
  createdAt: Date,
  total: string,
  extra: { paymentMethod?: "CASH" | "UPI" | "CARD"; customerName?: string; customerPhone?: string; discount?: string; taxTotal?: string } = {},
) {
  const discount = extra.discount ?? "0.00";
  return db.sale.create({
    data: {
      shopId: shop,
      userId,
      invoiceNumber: `INV-2029-30-${String(++invoice).padStart(6, "0")}`,
      financialYear: "2029-30",
      subtotal: (Number(total) + Number(discount)).toFixed(2),
      discount,
      discountType: Number(discount) > 0 ? "AMOUNT" : null,
      discountValue: Number(discount) > 0 ? discount : null,
      taxTotal: extra.taxTotal ?? "1.00",
      total,
      paymentMethod: extra.paymentMethod ?? "CASH",
      customerName: extra.customerName,
      customerPhone: extra.customerPhone,
      createdAt,
    },
  });
}

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST history shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST history other" } })).id;
  const userId = (await db.user.create({ data: { clerkId: `test_history_${shopId}`, email: "h@test.dev", shopId } })).id;
  const otherUserId = (await db.user.create({ data: { clerkId: `test_history_${otherShopId}`, email: "o@test.dev", shopId: otherShopId } })).id;

  // 14 Jan 2030, 23:30 IST (still the 14th in India).
  await sale(shopId, userId, new Date("2030-01-14T18:00:00Z"), "100.00", { customerName: "Late Night" });
  // 15 Jan 2030, 00:10 IST (the 15th in India, though still the 14th in UTC).
  await sale(shopId, userId, new Date("2030-01-14T18:40:00Z"), "200.00", { paymentMethod: "UPI", customerName: "Ravi Kumar", customerPhone: "9876543210" });
  // 15 Jan 2030, 15:30 IST, with a discount.
  await sale(shopId, userId, new Date("2030-01-15T10:00:00Z"), "300.00", { paymentMethod: "CARD", discount: "30.00", taxTotal: "14.29" });
  // 20 Jan 2030.
  await sale(shopId, userId, new Date("2030-01-20T06:00:00Z"), "50.00");
  // Today.
  await sale(shopId, userId, new Date(), "75.00", { customerName: "Today Customer" });
  // Another shop, same day as two of ours.
  await sale(otherShopId, otherUserId, new Date("2030-01-15T10:00:00Z"), "999.00", { customerName: "Ravi Other Shop" });
});

afterAll(async () => {
  const shops = { in: [shopId, otherShopId] };
  await db.sale.deleteMany({ where: { shopId: shops } });
  await db.user.deleteMany({ where: { shopId: shops } });
  await db.shop.deleteMany({ where: { id: shops } });
  await db.$disconnect();
});

const list = (input: Record<string, unknown>) => listSales(shopId, salesListSchema.parse(input));
const totals = (result: Awaited<ReturnType<typeof list>>) => result.sales.map((s) => s.total);

describe("listSales", () => {
  it("puts a sale on the Indian calendar day it happened", async () => {
    expect(totals(await list({ period: "custom", from: "2030-01-14", to: "2030-01-14" }))).toEqual(["100.00"]);
    expect(totals(await list({ period: "custom", from: "2030-01-15", to: "2030-01-15" }))).toEqual(["300.00", "200.00"]);
  });

  it("lists newest first and includes both end days of a range", async () => {
    const result = await list({ period: "custom", from: "2030-01-14", to: "2030-01-20" });
    expect(totals(result)).toEqual(["50.00", "300.00", "200.00", "100.00"]);
    expect(result.range).toEqual({ from: "2030-01-14", to: "2030-01-20" });
  });

  it("shows today's sales by default", async () => {
    const result = await list({});
    expect(result.sales.map((s) => s.customerName)).toEqual(["Today Customer"]);
  });

  it("filters by payment method", async () => {
    expect(totals(await list({ period: "all", paymentMethod: "UPI" }))).toEqual(["200.00"]);
  });

  it("searches invoice numbers, customer names and phone numbers", async () => {
    const byName = await list({ period: "all", search: "ravi" });
    expect(byName.sales.map((s) => s.customerName)).toEqual(["Ravi Kumar"]); // not the other shop's Ravi
    expect(totals(await list({ period: "all", search: "98765" }))).toEqual(["200.00"]);
    const invoiceNumber = byName.sales[0].invoiceNumber;
    expect(totals(await list({ period: "all", search: invoiceNumber.slice(-6).toLowerCase() }))).toEqual(["200.00"]);
  });

  it("totals everything that matches, not just the current page", async () => {
    const page = await list({ period: "custom", from: "2030-01-14", to: "2030-01-20", pageSize: 1 });
    expect(page.sales).toHaveLength(1);
    expect(page.total).toBe(4);
    expect(page.summary).toEqual({ bills: 4, amount: "650.00", discount: "30.00", tax: "17.29" });
    const page2 = await list({ period: "custom", from: "2030-01-14", to: "2030-01-20", pageSize: 3, page: 2 });
    expect(totals(page2)).toEqual(["100.00"]);
  });

  it("returns zeros, not nulls, when nothing matches", async () => {
    expect((await list({ period: "custom", from: "2031-01-01", to: "2031-01-31" })).summary).toEqual({
      bills: 0,
      amount: "0.00",
      discount: "0.00",
      tax: "0.00",
    });
  });

  it("never shows another shop's sales", async () => {
    const all = await list({ period: "all" });
    expect(all.sales.some((s) => s.total === "999.00")).toBe(false);
    expect(all.summary.bills).toBe(5);
  });
});

describe("salesListSchema", () => {
  it("needs both dates for a custom range, in order", () => {
    expect(salesListSchema.safeParse({ period: "custom", from: "2030-01-14" }).success).toBe(false);
    expect(salesListSchema.safeParse({ period: "custom", from: "2030-01-20", to: "2030-01-14" }).success).toBe(false);
    expect(salesListSchema.safeParse({ period: "custom", from: "2030-01-14", to: "2030-01-14" }).success).toBe(true);
  });
});
