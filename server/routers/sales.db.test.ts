// The sales router as the POS and the bill page use it, in temporary shops deleted afterwards. `npm run test:db`
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { createCaller } from "@/server/root";

let shopId: string;
let otherShopId: string;
const ids = { dolo: "", syrup: "", retired: "" };

const callerFor = (clerkId: string, email: string) =>
  createCaller({ db, headers: new Headers(), access: { status: "allowed", userId: clerkId, email } });
const me = () => callerFor("test_router_sales", "me@test.dev");
const other = () => callerFor("test_router_sales_other", "other@test.dev");

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST sales router shop", address: "MG Road, Belagavi", gstin: "29ABCDE1234F1Z5" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST sales router other" } })).id;
  // Pre-create users in the test shops so ensureUser() never attaches them to the real shop.
  await db.user.create({ data: { clerkId: "test_router_sales", email: "me@test.dev", shopId } });
  await db.user.create({ data: { clerkId: "test_router_sales_other", email: "other@test.dev", shopId: otherShopId } });

  const expiry = addDays(todayInIndia(), 300);
  const dolo = await db.medicine.create({
    data: {
      shopId, name: "Dolo 650", gstRate: "12", packSize: 15, unitLabel: "tablet", packLabel: "strip",
      batches: { create: { batchNumber: "D1", expiryDate: expiry, mrp: "33.60", purchasePrice: "24.00", sellingPrice: "33.60", quantity: 150 } },
    },
  });
  const syrup = await db.medicine.create({
    data: {
      shopId, name: "Benadryl", gstRate: "5", packSize: 1, unitLabel: "bottle", packLabel: "bottle",
      batches: { create: { batchNumber: "S1", expiryDate: expiry, mrp: "125.00", purchasePrice: "90.00", sellingPrice: "125.00", quantity: 10 } },
    },
  });
  const retired = await db.medicine.create({ data: { shopId, name: "Retired", gstRate: "5", isActive: false } });
  Object.assign(ids, { dolo: dolo.id, syrup: syrup.id, retired: retired.id });
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

async function trpcError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

describe("sales router", () => {
  let saleId = "";

  it("completes a sale from exactly what the POS sends", async () => {
    const sale = await me().sales.create({
      clientRequestId: "0123456789abcdef0123456789abcdef",
      items: [
        { key: "item-1", medicineId: ids.dolo, soldBy: "PACK", quantity: 2, batchId: null },
        { key: "item-2", medicineId: ids.dolo, soldBy: "UNIT", quantity: 5, batchId: null },
        { key: "item-3", medicineId: ids.syrup, soldBy: "PACK", quantity: 1, batchId: null },
      ],
      discount: { type: "PERCENT", value: "10" },
      paymentMethod: "UPI",
      customerName: "Ravi Kumar",
      customerPhone: "98765 43210",
      doctorName: "",
    });
    saleId = sale.id;
    // 2 × 33.60 + 5 × 2.24 + 125.00 = 203.40; − 10% (20.34) = 183.06
    expect(sale.total).toBe("183.06");
  });

  it("returns the bill with shop details, lines and a GST summary per rate", async () => {
    const bill = await me().sales.getById({ id: saleId });
    expect(bill).toMatchObject({
      shop: { name: "TEST sales router shop", address: "MG Road, Belagavi", gstin: "29ABCDE1234F1Z5" },
      cashier: "me@test.dev",
      paymentMethod: "UPI",
      customerName: "Ravi Kumar",
      customerPhone: "98765 43210",
      doctorName: null,
      discountType: "PERCENT",
      discountValue: "10",
      subtotal: "203.40",
      discount: "20.34",
      total: "183.06",
    });
    expect(bill.items.map((i) => `${i.medicineName} ${i.quantity} ${i.soldBy === "PACK" ? i.packLabel : i.unitLabel}`)).toEqual([
      "Dolo 650 2 strip",
      "Dolo 650 5 tablet",
      "Benadryl 1 bottle",
    ]);
    // Taxable value + GST for each rate adds up to what was paid; the GST adds up to the bill's GST.
    const paid = bill.gstSummary.reduce((sum, r) => sum + Number(r.taxable) + Number(r.tax), 0);
    expect(paid.toFixed(2)).toBe(bill.total);
    expect(bill.gstSummary.reduce((sum, r) => sum + Number(r.tax), 0).toFixed(2)).toBe(bill.taxTotal);
    expect(bill.gstSummary.map((r) => r.rate)).toEqual(["5", "12"]);
  });

  it("never shows a bill to another shop", async () => {
    expect((await trpcError(other().sales.getById({ id: saleId }))).code).toBe("NOT_FOUND");
  });

  it("refreshes cart products (and flags deactivated ones) for this shop only", async () => {
    const fresh = await me().sales.getProducts({ ids: [ids.dolo, ids.retired] });
    expect(fresh.map((p) => [p.name, p.isActive, p.sellableStock])).toEqual([
      ["Dolo 650", true, 150 - 30 - 5],
      ["Retired", false, 0],
    ]);
    expect(await other().sales.getProducts({ ids: [ids.dolo] })).toEqual([]);
  });

  it("explains why a sale was refused", async () => {
    const error = await trpcError(
      me().sales.create({
        clientRequestId: "fedcba9876543210fedcba9876543210",
        items: [{ key: "item-1", medicineId: ids.syrup, soldBy: "PACK", quantity: 50, batchId: null }],
        discount: null,
        paymentMethod: "CASH",
      }),
    );
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Not enough stock: Benadryl (41 bottles short).");
  });
});
