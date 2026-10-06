// Proves bills from lib/pricing.ts satisfy the database's own rules, and that the sale CHECK constraints
// reject impossible data. Runs in a temporary shop that is deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { calculateBill, type PriceLineInput } from "@/lib/pricing";

let shopId: string;
let userId: string;
let medicineId: string;
let batchId: string;
let invoice = 0;

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST pricing shop" } })).id;
  userId = (await db.user.create({ data: { clerkId: `test_pricing_${shopId}`, email: "p@test.dev", shopId } })).id;
  medicineId = (await db.medicine.create({ data: { shopId, name: "Pricing Med", gstRate: "12", packSize: 15 } })).id;
  batchId = (
    await db.inventoryBatch.create({
      data: { medicineId, batchNumber: "P1", expiryDate: new Date("2030-01-31"), mrp: "33.60", purchasePrice: "24", sellingPrice: "33.60", quantity: 500 },
    })
  ).id;
});

afterAll(async () => {
  await db.saleItem.deleteMany({ where: { sale: { shopId } } });
  await db.sale.deleteMany({ where: { shopId } });
  await db.inventoryBatch.deleteMany({ where: { medicineId } });
  await db.medicine.deleteMany({ where: { shopId } });
  await db.user.deleteMany({ where: { shopId } });
  await db.shop.delete({ where: { id: shopId } });
  await db.$disconnect();
});

const line = (overrides: Partial<PriceLineInput> = {}): PriceLineInput => ({
  packSellingPrice: "33.60",
  packMrp: "33.60",
  packSize: 15,
  gstRate: "12",
  soldBy: "PACK",
  quantity: 1,
  ...overrides,
});

type SaleOverrides = Partial<Prisma.SaleUncheckedCreateInput>;
type ItemOverrides = Partial<Prisma.SaleItemUncheckedCreateWithoutSaleInput>;

/** Saves a bill exactly as the sales service will (Phase 7), with optional overrides to break rules. */
function saveBill(lines: PriceLineInput[], discount: Parameters<typeof calculateBill>[1], sale: SaleOverrides = {}, item: ItemOverrides = {}) {
  const bill = calculateBill(lines, discount);
  return db.sale.create({
    data: {
      shopId,
      userId,
      invoiceNumber: `TEST-${++invoice}`,
      financialYear: "2026-27",
      subtotal: bill.subtotal,
      discountType: discount?.type ?? null,
      discountValue: discount?.value ?? null,
      discount: bill.discount,
      taxTotal: bill.taxTotal,
      total: bill.total,
      paymentMethod: "CASH",
      ...sale,
      items: {
        create: bill.lines.map((l) => ({
          medicineId,
          batchId,
          medicineName: "Pricing Med",
          batchNumber: "P1",
          expiryDate: new Date("2030-01-31"),
          mrp: l.unitMrp,
          gstRate: l.gstRate,
          soldBy: l.soldBy,
          quantity: l.quantity,
          unitsDeducted: l.unitsDeducted,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          discountAmount: l.discount,
          taxAmount: l.taxAmount,
          ...item,
        })),
      },
    },
    include: { items: true },
  });
}

const blocked = async (promise: Promise<unknown>, constraint: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as Error,
  );
  expect(error?.message ?? "saved without error").toContain(constraint);
};

describe("bills from calculateBill satisfy every database rule", () => {
  it("saves a mixed strip + loose bill with a percentage discount and customer details", async () => {
    const sale = await saveBill(
      [line({ quantity: 2 }), line({ soldBy: "UNIT", quantity: 7 }), line({ packSellingPrice: "20.00", packMrp: "20.00", gstRate: "5", soldBy: "UNIT", quantity: 4 })],
      { type: "PERCENT", value: "12.5" },
      { customerName: "Ravi Kumar", customerPhone: "9876543210", doctorName: "Dr. Mehta", paymentMethod: "UPI" },
    );
    expect(sale.items).toHaveLength(3);
    expect(sale.items.map((i) => i.unitsDeducted)).toEqual([30, 7, 4]);
    expect(sale).toMatchObject({ discountType: "PERCENT", customerName: "Ravi Kumar" });
    expect(sale.total.toFixed(2)).toBe(sale.subtotal.minus(sale.discount).toFixed(2));
  });

  it("saves a bill with a rupee discount equal to the whole bill", async () => {
    const sale = await saveBill([line()], { type: "AMOUNT", value: "33.60" });
    expect(sale.total.toFixed(2)).toBe("0.00");
  });

  it("saves a bill with no discount", async () => {
    const sale = await saveBill([line({ quantity: 3 })], null);
    expect(sale).toMatchObject({ discountType: null, discountValue: null });
  });
});

describe("sale rules reject impossible data", () => {
  it("loose line must deduct exactly its quantity", async () => {
    await blocked(saveBill([line({ soldBy: "UNIT", quantity: 5 })], null, {}, { unitsDeducted: 6 }), "SaleItem_unitsDeducted_check");
  });

  it("pack line must deduct a whole multiple of its quantity", async () => {
    await blocked(saveBill([line({ quantity: 2 })], null, {}, { unitsDeducted: 15 }), "SaleItem_unitsDeducted_check");
  });

  it("line discount can't exceed the line", async () => {
    await blocked(saveBill([line()], null, {}, { discountAmount: "40.00" }), "SaleItem_discountAmount_check");
  });

  it("GST can't exceed what was paid for the line", async () => {
    await blocked(saveBill([line()], null, {}, { discountAmount: "31.00", taxAmount: "3.60" }), "SaleItem_taxAmount_le_paid");
  });

  it("discount type and value go together, and a percentage can't exceed 100", async () => {
    await blocked(saveBill([line()], null, { discountType: "PERCENT" }), "Sale_discountInput_check");
    await blocked(saveBill([line()], null, { discountType: "PERCENT", discountValue: "150" }), "Sale_discountInput_check");
    await blocked(saveBill([line()], null, { discountValue: "10" }), "Sale_discountInput_check");
  });

  it("customer fields are either empty (null) or real text", async () => {
    await blocked(saveBill([line()], null, { customerName: "  " }), "Sale_customer_not_blank_check");
  });
});
