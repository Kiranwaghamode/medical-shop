// Runs against the real database inside temporary shops that are deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, dateToExpiryMonth, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { batchFieldsSchema, medicineFieldsSchema } from "@/lib/validations";
import * as inventory from "@/services/inventory.service";

const monthFromNow = (months: number) => {
  const today = todayInIndia();
  return dateToExpiryMonth(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 1)));
};

const medicine = (overrides: Partial<Record<string, unknown>> = {}) =>
  medicineFieldsSchema.parse({
    name: "Test Medicine",
    gstRate: "5",
    packSize: 10,
    unitLabel: "tablet",
    packLabel: "strip",
    minimumStock: 0,
    ...overrides,
  });

const batch = (overrides: Partial<Record<string, unknown>> = {}) =>
  batchFieldsSchema.parse({
    batchNumber: "B1",
    expiryMonth: monthFromNow(12),
    mrp: "50.00",
    purchasePrice: "35.00",
    sellingPrice: "50.00",
    quantity: 100,
    ...overrides,
  });

async function expectAppError(promise: Promise<unknown>, code: AppError["code"], message?: string | RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (message) expect((error as AppError).message).toMatch(message);
}

let shopId: string;
let otherShopId: string;

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST inventory shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST other shop" } })).id;
});

afterAll(async () => {
  const shops = { in: [shopId, otherShopId] };
  await db.saleItem.deleteMany({ where: { sale: { shopId: shops } } });
  await db.sale.deleteMany({ where: { shopId: shops } });
  await db.user.deleteMany({ where: { shopId: shops } });
  await db.inventoryBatch.deleteMany({ where: { medicine: { shopId: shops } } });
  await db.medicine.deleteMany({ where: { shopId: shops } });
  await db.shop.deleteMany({ where: { id: shops } });
  await db.$disconnect();
});

describe("create and read", () => {
  it("creates a medicine with its first batch and reads it back with money as strings", async () => {
    const { id } = await inventory.createMedicine(shopId, {
      ...medicine({ name: "Readback", barcode: "1111", gstRate: "12" }),
      firstBatch: batch({ batchNumber: "rb-01", mrp: "33.60", sellingPrice: "33.60", quantity: 125 }),
    });
    const result = await inventory.getMedicine(shopId, id);

    expect(result).toMatchObject({ name: "Readback", gstRate: "12", sellableStock: 125, status: "IN_STOCK", hasSales: false });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]).toMatchObject({
      batchNumber: "RB-01",
      mrp: "33.60",
      sellingPrice: "33.60",
      purchasePrice: "35.00",
      expiryMonth: monthFromNow(12),
      isExpired: false,
    });
  });

  it("orders batches by earliest expiry", async () => {
    const { id } = await inventory.createMedicine(shopId, medicine({ name: "Order" }));
    await inventory.addBatch(shopId, id, batch({ batchNumber: "LATE", expiryMonth: monthFromNow(20) }));
    await inventory.addBatch(shopId, id, batch({ batchNumber: "EARLY", expiryMonth: monthFromNow(2) }));
    const result = await inventory.getMedicine(shopId, id);
    expect(result.batches.map((b) => b.batchNumber)).toEqual(["EARLY", "LATE"]);
  });
});

describe("friendly errors from database rules", () => {
  it("rejects a duplicate barcode in the same shop", async () => {
    await inventory.createMedicine(shopId, medicine({ name: "Barcode A", barcode: "2222" }));
    await expectAppError(
      inventory.createMedicine(shopId, medicine({ name: "Barcode B", barcode: "2222" })),
      "CONFLICT",
      "Another medicine already uses this barcode.",
    );
  });

  it("allows the same barcode in a different shop", async () => {
    await expect(inventory.createMedicine(otherShopId, medicine({ barcode: "2222" }))).resolves.toHaveProperty("id");
  });

  it("rejects a duplicate batch number for the same medicine", async () => {
    const { id } = await inventory.createMedicine(shopId, { ...medicine({ name: "Dup batch" }), firstBatch: batch() });
    await expectAppError(inventory.addBatch(shopId, id, batch()), "CONFLICT", "already has a batch with that number");
  });

  it("is protected by the database even if validation were skipped (selling price above MRP)", async () => {
    const { id } = await inventory.createMedicine(shopId, medicine({ name: "Above MRP" }));
    // Bypass the Zod refine on purpose to prove the database rule is the last line of defence.
    const bad = { ...batch(), sellingPrice: "60.00" };
    await expectAppError(inventory.addBatch(shopId, id, bad), "CONFLICT", "Selling price can't be more than MRP.");
  });
});

describe("list, search and filters", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const make = async (key: string, minimumStock: number, batches: ReturnType<typeof batch>[], extra = {}) => {
      const { id } = await inventory.createMedicine(otherShopId, medicine({ name: `List ${key}`, minimumStock, ...extra }));
      for (const b of batches) await inventory.addBatch(otherShopId, id, b);
      ids[key] = id;
    };
    await make("normal", 10, [batch({ quantity: 50 })], { genericName: "Paracetamol", barcode: "890555" });
    await make("low", 20, [batch({ quantity: 6 })]);
    await make("out", 10, [batch({ quantity: 0 })]);
    await make("expiring", 0, [batch({ quantity: 5, expiryMonth: dateToExpiryMonth(todayInIndia()) })]);
    await make("expired", 0, [
      batch({ batchNumber: "OLD", quantity: 3, expiryMonth: dateToExpiryMonth(addDays(todayInIndia(), -62)) }),
      batch({ batchNumber: "NEW", quantity: 40 }),
    ]);
    await make("inactive", 0, [batch()]);
    await inventory.setMedicineActive(otherShopId, ids.inactive, false);
  });

  const list = (filter: "all" | "low" | "out" | "expiring" | "expired" | "inactive", search?: string) =>
    inventory.listMedicines(otherShopId, { filter, search, page: 1, pageSize: 50 });
  const names = (result: Awaited<ReturnType<typeof list>>) => result.items.map((i) => i.name).filter((n) => n.startsWith("List"));

  it("filters by stock status", async () => {
    expect(names(await list("low"))).toEqual(["List low"]);
    expect(names(await list("out"))).toEqual(["List out"]);
    expect(names(await list("expiring"))).toEqual(["List expiring"]);
    expect(names(await list("expired"))).toEqual(["List expired"]);
    expect(names(await list("inactive"))).toEqual(["List inactive"]);
    expect(names(await list("all"))).not.toContain("List inactive");
  });

  it("counts expired stock separately from sellable stock", async () => {
    const item = (await list("expired")).items.find((i) => i.id === ids.expired)!;
    expect(item).toMatchObject({ sellableStock: 40, expiredStock: 3, status: "IN_STOCK" });
  });

  it("searches by name, generic name and barcode prefix", async () => {
    expect(names(await list("all", "list LOW"))).toEqual(["List low"]);
    expect(names(await list("all", "paracet"))).toEqual(["List normal"]);
    expect(names(await list("all", "890555"))).toEqual(["List normal"]);
  });

  it("paginates", async () => {
    const page1 = await inventory.listMedicines(otherShopId, { filter: "all", search: "List", page: 1, pageSize: 2 });
    const page3 = await inventory.listMedicines(otherShopId, { filter: "all", search: "List", page: 3, pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items).toHaveLength(2);
    expect(page3.items).toHaveLength(1);
    expect(page1.counts).toMatchObject({ all: 5, low: 1, out: 1, expiring: 1, expired: 1, inactive: 1 });
  });
});

describe("shop isolation", () => {
  it("never lets one shop read or change another shop's medicines and batches", async () => {
    const { id } = await inventory.createMedicine(shopId, { ...medicine({ name: "Private" }), firstBatch: batch() });
    const batchId = (await inventory.getMedicine(shopId, id)).batches[0].id;

    await expectAppError(inventory.getMedicine(otherShopId, id), "NOT_FOUND");
    await expectAppError(inventory.updateMedicine(otherShopId, id, medicine({ name: "Hacked" })), "NOT_FOUND");
    await expectAppError(inventory.setMedicineActive(otherShopId, id, false), "NOT_FOUND");
    await expectAppError(inventory.deleteMedicine(otherShopId, id), "NOT_FOUND");
    await expectAppError(inventory.addBatch(otherShopId, id, batch({ batchNumber: "X" })), "NOT_FOUND");
    await expectAppError(inventory.updateBatch(otherShopId, batchId, batch({ quantity: 0 })), "NOT_FOUND");
    await expectAppError(inventory.deleteBatch(otherShopId, batchId), "NOT_FOUND");

    const unchanged = await inventory.getMedicine(shopId, id);
    expect(unchanged).toMatchObject({ name: "Private", isActive: true, sellableStock: 100 });
    const otherList = await inventory.listMedicines(otherShopId, { filter: "all", search: "Private", page: 1, pageSize: 50 });
    expect(otherList.total).toBe(0);
  });
});

describe("deleting", () => {
  it("deletes a never-sold medicine together with its batches", async () => {
    const { id } = await inventory.createMedicine(shopId, { ...medicine({ name: "Mistake" }), firstBatch: batch() });
    await inventory.deleteMedicine(shopId, id);
    await expectAppError(inventory.getMedicine(shopId, id), "NOT_FOUND");
    expect(await db.inventoryBatch.count({ where: { medicineId: id } })).toBe(0);
  });

  it("refuses to delete a sold medicine or batch, and keeps them intact", async () => {
    const { id } = await inventory.createMedicine(shopId, { ...medicine({ name: "Sold" }), firstBatch: batch() });
    const sold = await inventory.getMedicine(shopId, id);
    const user = await db.user.create({ data: { clerkId: `test_inv_${shopId}`, email: "t@test.dev", shopId } });
    await db.sale.create({
      data: {
        shopId, userId: user.id, invoiceNumber: "TEST-1", financialYear: "2026-27",
        subtotal: "50.00", discount: "0", taxTotal: "2.38", total: "50.00", paymentMethod: "CASH",
        items: {
          create: {
            medicineId: id, batchId: sold.batches[0].id, medicineName: "Sold", batchNumber: "B1",
            expiryDate: sold.batches[0].expiryDate, mrp: "50.00", gstRate: "5", quantity: 1,
            unitPrice: "50.00", lineTotal: "50.00", taxAmount: "2.38",
          },
        },
      },
    });

    await expectAppError(inventory.deleteMedicine(shopId, id), "CONFLICT", /Deactivate it instead/);
    await expectAppError(inventory.deleteBatch(shopId, sold.batches[0].id), "CONFLICT", /Set its quantity to 0/);
    expect((await inventory.getMedicine(shopId, id)).hasSales).toBe(true);

    // Deactivating is the way to retire it.
    await inventory.setMedicineActive(shopId, id, false);
    expect((await inventory.getMedicine(shopId, id)).status).toBe("INACTIVE");
  });

  it("deletes an unsold batch", async () => {
    const { id } = await inventory.createMedicine(shopId, { ...medicine({ name: "Batch delete" }), firstBatch: batch() });
    const batchId = (await inventory.getMedicine(shopId, id)).batches[0].id;
    await inventory.deleteBatch(shopId, batchId);
    expect((await inventory.getMedicine(shopId, id)).batches).toHaveLength(0);
  });
});
