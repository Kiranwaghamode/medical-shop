// Reports against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { createSaleSchema, reportRangeSchema } from "@/lib/validations";
import { expiryReport, salesReport, stockReport, topMedicines } from "@/services/reports.service";
import { createSale } from "@/services/sales.service";

let shopId: string;
let otherShopId: string;
let userId: string;
const ids = { dolo: "", syrup: "", cream: "" };
const today = todayInIndia();
let request = 0;

const toPaise = (value: string) => Math.round(Number(value) * 100);
const sumPaise = (values: string[]) => values.reduce((sum, v) => sum + toPaise(v), 0);

type Item = { medicineId: string; soldBy: "PACK" | "UNIT"; quantity: number };
async function sell(items: Item[], at: string, paymentMethod: "CASH" | "UPI" | "CARD", discount: { type: "PERCENT" | "AMOUNT"; value: string } | null = null) {
  const sale = await createSale(
    shopId,
    userId,
    createSaleSchema.parse({
      clientRequestId: `test-report-${++request}-${Date.now()}`,
      items: items.map((item, i) => ({ key: `k${i}`, batchId: null, ...item })),
      discount,
      paymentMethod,
    }),
  );
  // Move it to a known moment so periods can be tested exactly.
  await db.sale.update({ where: { id: sale.id }, data: { createdAt: new Date(at) } });
  return sale;
}

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST reports shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST reports other" } })).id;
  userId = (await db.user.create({ data: { clerkId: `test_reports_${shopId}`, email: "r@test.dev", shopId } })).id;

  const far = addDays(today, 400);
  const med = (name: string, gstRate: string, packSize: number, sellingPrice: string, quantity: number) =>
    db.medicine.create({
      data: {
        shopId,
        name,
        gstRate,
        packSize,
        unitLabel: packSize > 1 ? "tablet" : "bottle",
        packLabel: packSize > 1 ? "strip" : "bottle",
        batches: { create: { batchNumber: "S1", expiryDate: far, mrp: sellingPrice, purchasePrice: "1.00", sellingPrice, quantity } },
      },
    });
  ids.dolo = (await med("Dolo 650", "12", 10, "33.60", 1000)).id;
  ids.syrup = (await med("Benadryl", "5", 1, "125.00", 100)).id;
  ids.cream = (await med("Volini", "18", 1, "99.99", 100)).id;

  // 10 Jan 2030, 11:30 IST — Cash: 2 strips Dolo + 1 Benadryl = 67.20 + 125.00
  await sell([{ medicineId: ids.dolo, soldBy: "PACK", quantity: 2 }, { medicineId: ids.syrup, soldBy: "PACK", quantity: 1 }], "2030-01-10T06:00:00Z", "CASH");
  // 10 Jan 2030, 23:30 IST — UPI: 1 Volini = 99.99 (odd paise of GST)
  await sell([{ medicineId: ids.cream, soldBy: "PACK", quantity: 1 }], "2030-01-10T18:00:00Z", "UPI");
  // 11 Jan 2030, 00:10 IST — Card: 5 loose Dolo (5 × 3.36 = 16.80) + 1 Benadryl, 10% off → 141.80 − 14.18
  await sell(
    [{ medicineId: ids.dolo, soldBy: "UNIT", quantity: 5 }, { medicineId: ids.syrup, soldBy: "PACK", quantity: 1 }],
    "2030-01-10T18:40:00Z",
    "CARD",
    { type: "PERCENT", value: "10" },
  );
  // 20 Dec 2029 — previous month: 3 Benadryl
  await sell([{ medicineId: ids.syrup, soldBy: "PACK", quantity: 3 }], "2029-12-20T06:00:00Z", "CASH");
});

afterAll(async () => {
  const shops = { in: [shopId, otherShopId] };
  await db.saleItem.deleteMany({ where: { sale: { shopId: shops } } });
  await db.sale.deleteMany({ where: { shopId: shops } });
  await db.invoiceCounter.deleteMany({ where: { shopId: shops } });
  await db.inventoryBatch.deleteMany({ where: { medicine: { shopId: shops } } });
  await db.medicine.deleteMany({ where: { shopId: shops } });
  await db.user.deleteMany({ where: { shopId: shops } });
  await db.shop.deleteMany({ where: { id: shops } });
  await db.$disconnect();
});

const january = reportRangeSchema.parse({ period: "custom", from: "2030-01-10", to: "2030-01-11" });

describe("salesReport", () => {
  it("totals the period and puts each sale on its Indian calendar day", async () => {
    const report = await salesReport(shopId, january);
    expect(report.totals).toMatchObject({ bills: 3, subtotal: "433.99", discount: "14.18", amount: "419.81" }); // 192.20 + 99.99 + 141.80 − 14.18
    expect(report.days).toEqual([
      expect.objectContaining({ day: "2030-01-10", bills: 2, amount: "292.19" }), // 192.20 + 99.99 (23:30 IST)
      expect.objectContaining({ day: "2030-01-11", bills: 1, amount: "127.62", discount: "14.18" }), // 00:10 IST
    ]);
    expect(sumPaise(report.days.map((d) => d.amount))).toBe(toPaise(report.totals.amount));
  });

  it("splits by payment method", async () => {
    const report = await salesReport(shopId, january);
    expect(report.byPayment).toEqual([
      { method: "CASH", bills: 1, amount: "192.20" },
      { method: "UPI", bills: 1, amount: "99.99" },
      { method: "CARD", bills: 1, amount: "127.62" },
    ]);
  });

  it("splits GST by rate into CGST + SGST that add up exactly", async () => {
    const report = await salesReport(shopId, january);
    expect(report.byGstRate.map((r) => r.rate)).toEqual(["5", "12", "18"]);
    for (const row of report.byGstRate) {
      expect(toPaise(row.taxable) + toPaise(row.tax)).toBe(toPaise(row.total));
      expect(toPaise(row.cgst) + toPaise(row.sgst)).toBe(toPaise(row.tax));
      expect(toPaise(row.cgst) - toPaise(row.sgst)).toBeGreaterThanOrEqual(0);
      expect(toPaise(row.cgst) - toPaise(row.sgst)).toBeLessThanOrEqual(1);
    }
    // 99.99 at 18% contains 15.25 GST (odd paise): CGST 7.63 + SGST 7.62.
    expect(report.byGstRate.find((r) => r.rate === "18")).toMatchObject({ total: "99.99", tax: "15.25", cgst: "7.63", sgst: "7.62", taxable: "84.74" });
    // The GST table covers every rupee sold, and its GST matches the bills'.
    expect(report.gstTotals.total).toBe(report.totals.amount);
    expect(report.gstTotals.tax).toBe(report.totals.tax);
  });

  it("covers last month for GST filing", async () => {
    const report = await salesReport(shopId, reportRangeSchema.parse({ period: "last-month" }), new Date("2030-02-05T06:00:00Z"));
    expect(report.range).toEqual({ from: "2030-01-01", to: "2030-01-31" });
    expect(report.days).toHaveLength(31);
    expect(report.totals.bills).toBe(3); // not December's sale
  });
});

describe("topMedicines", () => {
  it("ranks by amount after discount, or by units sold", async () => {
    const byAmount = await topMedicines(shopId, { range: january, sortBy: "amount", limit: 10 });
    expect(byAmount.items.map((i) => [i.name, i.amount])).toEqual([
      ["Benadryl", "237.50"], // 125.00 + 125.00 − 12.50 share of the discount
      ["Volini", "99.99"],
      ["Dolo 650", "82.32"], // 67.20 + 16.80 − 1.68
    ]);
    expect(byAmount.totalAmount).toBe("419.81");
    expect(byAmount.items[0].share).toBe("56.6");

    const byQuantity = await topMedicines(shopId, { range: january, sortBy: "quantity", limit: 2 });
    expect(byQuantity.items.map((i) => [i.name, i.units])).toEqual([
      ["Dolo 650", 25], // 2 strips × 10 + 5 loose
      ["Benadryl", 2],
    ]);
  });
});

describe("stockReport", () => {
  it("values sellable stock at purchase and selling price, and expired stock separately", async () => {
    const med = await db.medicine.create({
      data: {
        shopId,
        name: "Stock Value Med",
        gstRate: "5",
        packSize: 10,
        batches: {
          create: [
            { batchNumber: "OK", expiryDate: addDays(today, 200), mrp: "50.00", purchasePrice: "40.00", sellingPrice: "50.00", quantity: 25 },
            { batchNumber: "OLD", expiryDate: addDays(today, -3), mrp: "50.00", purchasePrice: "40.00", sellingPrice: "50.00", quantity: 10 },
          ],
        },
      },
    });
    await db.medicine.create({ data: { shopId, name: "Retired Empty", gstRate: "5", isActive: false } });

    const report = await stockReport(shopId);
    // 25 tablets = 2.5 strips: × ₹40 = ₹100.00 at purchase, × ₹50 = ₹125.00 at selling; 10 expired tablets = ₹40.00.
    expect(report.items.find((i) => i.id === med.id)).toMatchObject({
      sellableUnits: 25,
      expiredUnits: 10,
      purchaseValue: "100.00",
      sellingValue: "125.00",
      expiredValue: "40.00",
    });
    expect(report.items.map((i) => i.name)).not.toContain("Retired Empty");
    const sum = (key: "purchaseValue" | "sellingValue" | "expiredValue") => sumPaise(report.items.map((i) => i[key]));
    expect(sum("purchaseValue")).toBe(toPaise(report.totals.purchaseValue));
    expect(sum("sellingValue")).toBe(toPaise(report.totals.sellingValue));
    expect(sum("expiredValue")).toBe(toPaise(report.totals.expiredValue));
  });
});

describe("expiryReport", () => {
  it("lists expired and soon-expiring batches, soonest first, within the chosen window", async () => {
    await db.medicine.create({
      data: {
        shopId,
        name: "Expiry Med",
        gstRate: "5",
        packSize: 1,
        batches: {
          create: [-5, 20, 50, 80, 120].map((days) => ({
            batchNumber: `E${days}`,
            expiryDate: addDays(today, days),
            mrp: "10.00",
            purchasePrice: "8.00",
            sellingPrice: "10.00",
            quantity: 2,
          })),
        },
      },
    });
    const batches = async (withinDays: 30 | 60 | 90) =>
      (await expiryReport(shopId, { withinDays })).items.filter((i) => i.medicine.name === "Expiry Med").map((i) => [i.batchNumber, i.daysLeft]);

    expect(await batches(30)).toEqual([["E-5", -5], ["E20", 20]]);
    expect(await batches(60)).toEqual([["E-5", -5], ["E20", 20], ["E50", 50]]);
    expect(await batches(90)).toEqual([["E-5", -5], ["E20", 20], ["E50", 50], ["E80", 80]]);

    const report = await expiryReport(shopId, { withinDays: 90 });
    const expired = report.items.filter((i) => i.expired);
    expect(sumPaise(expired.map((i) => i.value))).toBe(toPaise(report.totals.expiredValue));
    expect(report.items.find((i) => i.batchNumber === "E20")).toMatchObject({ value: "16.00", quantity: 2, expired: false });
  });

  it("never shows another shop's stock or sales", async () => {
    expect((await salesReport(otherShopId, january)).totals.bills).toBe(0);
    expect((await stockReport(otherShopId)).items).toEqual([]);
    expect((await expiryReport(otherShopId, { withinDays: 90 })).items).toEqual([]);
  });
});
