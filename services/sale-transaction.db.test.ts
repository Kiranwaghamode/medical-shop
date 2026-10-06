// The sale transaction against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { financialYear } from "@/lib/invoice";
import { createSaleSchema } from "@/lib/validations";
import { createSale } from "@/services/sales.service";

const today = todayInIndia();
let shopId: string;
let otherShopId: string;
let userId: string;
let request = 0;

// Dolo: 15 per strip, three batches (expired / sooner / later). Syrup: sold whole.
const ids = { dolo: "", syrup: "", retired: "", expired: "", soon: "", later: "", syrupBatch: "" };

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST sale tx shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST sale tx other shop" } })).id;
  userId = (await db.user.create({ data: { clerkId: `test_saletx_${shopId}`, email: "s@test.dev", shopId } })).id;

  const dolo = await db.medicine.create({ data: { shopId, name: "Dolo 650", gstRate: "12", packSize: 15, unitLabel: "tablet", packLabel: "strip" } });
  const syrup = await db.medicine.create({ data: { shopId, name: "Benadryl", gstRate: "5", packSize: 1, unitLabel: "bottle", packLabel: "bottle" } });
  const retired = await db.medicine.create({ data: { shopId, name: "Retired", gstRate: "5", isActive: false } });
  Object.assign(ids, { dolo: dolo.id, syrup: syrup.id, retired: retired.id });

  const batch = (medicineId: string, batchNumber: string, expiryDate: Date, sellingPrice = "33.60") =>
    db.inventoryBatch.create({
      data: { medicineId, batchNumber, expiryDate, mrp: "33.60", purchasePrice: "24.00", sellingPrice, quantity: 0 },
    });
  ids.expired = (await batch(dolo.id, "EXP", addDays(today, -10))).id;
  ids.soon = (await batch(dolo.id, "SOON", addDays(today, 40))).id;
  ids.later = (await batch(dolo.id, "LATER", addDays(today, 400), "32.00")).id;
  ids.syrupBatch = (
    await db.inventoryBatch.create({
      data: { medicineId: syrup.id, batchNumber: "S1", expiryDate: addDays(today, 200), mrp: "125.00", purchasePrice: "90.00", sellingPrice: "125.00", quantity: 0 },
    })
  ).id;
  await db.inventoryBatch.create({
    data: { medicineId: retired.id, batchNumber: "R1", expiryDate: addDays(today, 200), mrp: "10.00", purchasePrice: "5.00", sellingPrice: "10.00", quantity: 50 },
  });
});

// Every test starts from the same stock: EXP 75, SOON 307 (20 strips + 7), LATER 1500, syrup 3.
beforeEach(async () => {
  await db.inventoryBatch.update({ where: { id: ids.expired }, data: { quantity: 75 } });
  await db.inventoryBatch.update({ where: { id: ids.soon }, data: { quantity: 307 } });
  await db.inventoryBatch.update({ where: { id: ids.later }, data: { quantity: 1500 } });
  await db.inventoryBatch.update({ where: { id: ids.syrupBatch }, data: { quantity: 3 } });
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

type Item = { medicineId: string; soldBy: "PACK" | "UNIT"; quantity: number; batchId?: string | null };
const sell = (items: Item[], extra: Record<string, unknown> = {}, shop = shopId) =>
  createSale(
    shop,
    userId,
    createSaleSchema.parse({
      clientRequestId: `test-request-${++request}-${Date.now()}`,
      items: items.map((item, i) => ({ key: `k${i}`, batchId: null, ...item })),
      discount: null,
      paymentMethod: "CASH",
      ...extra,
    }),
  );

const stock = async () =>
  Object.fromEntries(
    (await db.inventoryBatch.findMany({ where: { id: { in: [ids.expired, ids.soon, ids.later, ids.syrupBatch] } } })).map((b) => [
      b.batchNumber,
      b.quantity,
    ]),
  );

async function rejected(promise: Promise<unknown>, code: AppError["code"], message: string | RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  expect((error as AppError).message).toMatch(message);
}

describe("createSale", () => {
  it("saves the sale, deducts stock from the earliest batches and numbers the invoice", async () => {
    const sale = await sell(
      [
        { medicineId: ids.dolo, soldBy: "PACK", quantity: 21 }, // 20 strips from SOON + 1 from LATER (EXP skipped)
        { medicineId: ids.dolo, soldBy: "UNIT", quantity: 10 }, // 7 loose from SOON + 3 from LATER
        { medicineId: ids.syrup, soldBy: "PACK", quantity: 2 },
      ],
      { customerName: "Ravi", doctorName: "Dr. Mehta", paymentMethod: "UPI" },
    );

    expect(sale.invoiceNumber).toMatch(new RegExp(`^INV-${financialYear()}-\\d{6}$`));
    expect(await stock()).toEqual({ EXP: 75, SOON: 0, LATER: 1500 - 15 - 3, S1: 1 });

    const saved = await db.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: { orderBy: { id: "asc" } } } });
    expect(saved).toMatchObject({ shopId, userId, paymentMethod: "UPI", customerName: "Ravi", doctorName: "Dr. Mehta", customerPhone: null });
    // 20×33.60 + 1×32.00 + 7×2.24 + 3×2.13 + 2×125.00
    expect(saved.subtotal.toFixed(2)).toBe("976.07"); // 672.00 + 32.00 + 15.68 + 6.39 + 250.00
    expect(saved.total.toFixed(2)).toBe(sale.total);
    const lines = saved.items.map((i) => `${i.batchNumber}:${i.soldBy}×${i.quantity}@${i.unitPrice.toFixed(2)}`).sort();
    expect(lines).toEqual(["LATER:PACK×1@32.00", "LATER:UNIT×3@2.13", "S1:PACK×2@125.00", "SOON:PACK×20@33.60", "SOON:UNIT×7@2.24"]);
    expect(saved.items.every((i) => i.medicineName && i.expiryDate)).toBe(true);
  });

  it("uses only server-side prices and applies the discount", async () => {
    // The input has no price fields at all; anything extra the client might send is stripped by the schema.
    const parsed = createSaleSchema.parse({
      clientRequestId: "test-tamper-123456",
      items: [{ key: "a", medicineId: ids.syrup, soldBy: "PACK", quantity: 1, batchId: null, unitPrice: "0.01", total: "0.01" }],
      discount: { type: "PERCENT", value: "10" },
      paymentMethod: "CASH",
      total: "0.01",
    });
    expect(parsed).not.toHaveProperty("total");
    const sale = await createSale(shopId, userId, parsed);
    expect(sale.total).toBe("112.50"); // 125.00 − 10%
  });

  it("honours a chosen batch", async () => {
    await sell([{ medicineId: ids.dolo, soldBy: "PACK", quantity: 2, batchId: ids.later }]);
    expect(await stock()).toMatchObject({ SOON: 307, LATER: 1470 });
  });

  it("never sells expired stock, even when that batch is chosen", async () => {
    await rejected(sell([{ medicineId: ids.dolo, soldBy: "PACK", quantity: 1, batchId: ids.expired }]), "CONFLICT", /has expired or has no stock/);
    expect(await stock()).toMatchObject({ EXP: 75 });
  });

  it("explains a shortage and changes nothing", async () => {
    await rejected(
      sell([
        { medicineId: ids.syrup, soldBy: "PACK", quantity: 1 },
        { medicineId: ids.syrup, soldBy: "PACK", quantity: 4 },
      ]),
      "CONFLICT",
      "Not enough stock: Benadryl (2 bottles short).",
    );
    expect(await stock()).toMatchObject({ S1: 3 });
  });

  it("rolls everything back when any part fails — no partial sale, no used invoice number", async () => {
    const salesBefore = await db.sale.count({ where: { shopId } });
    const counterBefore = await db.invoiceCounter.findFirst({ where: { shopId } });
    // Fine on its own, but the discount is larger than the bill: fails after allocation.
    await rejected(
      sell([{ medicineId: ids.dolo, soldBy: "PACK", quantity: 1 }], { discount: { type: "AMOUNT", value: "999" } }),
      "BAD_REQUEST",
      "Discount can't be more than the bill total.",
    );
    expect(await stock()).toEqual({ EXP: 75, SOON: 307, LATER: 1500, S1: 3 });
    expect(await db.sale.count({ where: { shopId } })).toBe(salesBefore);
    expect((await db.invoiceCounter.findFirst({ where: { shopId } }))?.lastNumber).toBe(counterBefore?.lastNumber);
  });

  it("refuses deactivated medicines, loose sale of whole-only items, and other shops' medicines", async () => {
    await rejected(sell([{ medicineId: ids.retired, soldBy: "PACK", quantity: 1 }]), "CONFLICT", "Retired has been deactivated and can't be sold.");
    await rejected(sell([{ medicineId: ids.syrup, soldBy: "UNIT", quantity: 1 }]), "BAD_REQUEST", "Benadryl can only be sold whole.");
    await rejected(sell([{ medicineId: ids.dolo, soldBy: "PACK", quantity: 1 }], {}, otherShopId), "NOT_FOUND", /no longer exists/);
    expect(await stock()).toEqual({ EXP: 75, SOON: 307, LATER: 1500, S1: 3 });
  });

  it("returns the same sale for a repeated request instead of billing twice", async () => {
    const input = createSaleSchema.parse({
      clientRequestId: `test-repeat-${Date.now()}`,
      items: [{ key: "a", medicineId: ids.syrup, soldBy: "PACK", quantity: 1, batchId: null }],
      discount: null,
      paymentMethod: "CASH",
    });
    const first = await createSale(shopId, userId, input);
    const again = await createSale(shopId, userId, input);
    expect(again).toEqual(first);
    expect(await stock()).toMatchObject({ S1: 2 }); // deducted once
  });

  it("numbers consecutive sales consecutively", async () => {
    const a = await sell([{ medicineId: ids.syrup, soldBy: "PACK", quantity: 1 }]);
    const b = await sell([{ medicineId: ids.syrup, soldBy: "PACK", quantity: 1 }]);
    const n = (invoice: string) => Number(invoice.split("-").at(-1));
    expect(n(b.invoiceNumber)).toBe(n(a.invoiceNumber) + 1);
  });
});
