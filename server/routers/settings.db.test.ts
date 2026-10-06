// Shop settings through the router, in temporary shops deleted afterwards. `npm run test:db`
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { createCaller } from "@/server/root";

let shopId: string;
let otherShopId: string;

const callerFor = (clerkId: string) =>
  createCaller({ db, headers: new Headers(), access: { status: "allowed", userId: clerkId, email: `${clerkId}@test.dev` } });
const me = () => callerFor("test_router_settings");
const other = () => callerFor("test_router_settings_other");

const settings = {
  name: "ABC Medical Store",
  address: "MG Road, Belagavi",
  phone: "0831-2401234",
  gstin: "29ABCDE1234F1Z5",
  drugLicenseNumber: "KA-BGM-20B-12345",
  billFooter: "Goods once sold will not be taken back.",
  billPaperSize: "A4" as const,
  autoPrint: false,
};

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST settings shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST settings other" } })).id;
  await db.user.create({ data: { clerkId: "test_router_settings", email: "s@test.dev", shopId } });
  await db.user.create({ data: { clerkId: "test_router_settings_other", email: "o@test.dev", shopId: otherShopId } });
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

describe("settings router", () => {
  it("starts with defaults: A5 paper and automatic printing", async () => {
    expect(await me().settings.get()).toMatchObject({
      name: "TEST settings shop",
      gstin: null,
      drugLicenseNumber: null,
      billPaperSize: "A5",
      autoPrint: true,
    });
  });

  it("saves the shop details and returns them", async () => {
    expect(await me().settings.update(settings)).toEqual(settings);
    expect(await me().settings.get()).toEqual(settings);
  });

  it("rejects an invalid GSTIN without changing anything", async () => {
    const error = await me()
      .settings.update({ ...settings, gstin: "NOT-A-GSTIN" })
      .then(
        () => null,
        (e: unknown) => e as TRPCError,
      );
    expect(error).toBeInstanceOf(TRPCError);
    expect(error?.code).toBe("BAD_REQUEST");
    expect((await me().settings.get()).gstin).toBe("29ABCDE1234F1Z5");
  });

  it("only ever changes the caller's own shop", async () => {
    await other().settings.update({ ...settings, name: "Other renamed" });
    expect((await me().settings.get()).name).toBe("ABC Medical Store");
    expect((await other().settings.get()).name).toBe("Other renamed");
  });

  it("prints the saved details on bills", async () => {
    const medicine = await db.medicine.create({
      data: {
        shopId,
        name: "Bill Med",
        gstRate: "5",
        batches: {
          create: { batchNumber: "B1", expiryDate: addDays(todayInIndia(), 100), mrp: "10.00", purchasePrice: "7.00", sellingPrice: "10.00", quantity: 5 },
        },
      },
    });
    const sale = await me().sales.create({
      clientRequestId: "settings-bill-test-0001",
      items: [{ key: "a", medicineId: medicine.id, soldBy: "PACK", quantity: 1, batchId: null }],
      discount: null,
      paymentMethod: "CASH",
    });
    expect((await me().sales.getById({ id: sale.id })).shop).toEqual(settings);
  });
});
