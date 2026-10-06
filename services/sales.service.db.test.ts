// Counter product search against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { searchProducts } from "@/services/sales.service";

let shopId: string;
let otherShopId: string;
const today = todayInIndia();

async function medicine(
  shop: string,
  data: { name: string; genericName?: string; barcode?: string; packSize?: number; isActive?: boolean },
  batches: { batchNumber: string; expiryDate: Date; quantity: number; sellingPrice?: string }[],
) {
  return db.medicine.create({
    data: {
      shopId: shop,
      gstRate: "5",
      packSize: 15,
      ...data,
      batches: {
        create: batches.map((b) => ({ mrp: "20.00", purchasePrice: "14.00", sellingPrice: b.sellingPrice ?? "20.00", ...b })),
      },
    },
  });
}

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST sales search shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST sales other shop" } })).id;

  await medicine(shopId, { name: "Zeta Paracip", genericName: "Paracetamol 500 mg", barcode: "8900000000017" }, [
    { batchNumber: "EXPIRED", expiryDate: addDays(today, -1), quantity: 50 },
    { batchNumber: "LATE", expiryDate: addDays(today, 400), quantity: 30 },
    { batchNumber: "EMPTY", expiryDate: addDays(today, 60), quantity: 0 },
    { batchNumber: "TODAY", expiryDate: today, quantity: 5 }, // still sellable on its expiry date
    { batchNumber: "SOON", expiryDate: addDays(today, 20), quantity: 10 },
  ]);
  await medicine(shopId, { name: "Paracold Syrup", genericName: "Paracetamol syrup", packSize: 1 }, [
    { batchNumber: "S1", expiryDate: addDays(today, 200), quantity: 12, sellingPrice: "18.50" },
  ]);
  await medicine(shopId, { name: "Paraxin Out", genericName: "Paracetamol 650 mg" }, [
    { batchNumber: "GONE", expiryDate: addDays(today, -30), quantity: 40 }, // only expired stock
  ]);
  await medicine(shopId, { name: "Paradox Retired", isActive: false }, [
    { batchNumber: "R1", expiryDate: addDays(today, 200), quantity: 99 },
  ]);
  await medicine(otherShopId, { name: "Paracetamol Other Shop", barcode: "8900000000017" }, [
    { batchNumber: "O1", expiryDate: addDays(today, 200), quantity: 99 },
  ]);
});

afterAll(async () => {
  const shops = { in: [shopId, otherShopId] };
  await db.inventoryBatch.deleteMany({ where: { medicine: { shopId: shops } } });
  await db.medicine.deleteMany({ where: { shopId: shops } });
  await db.shop.deleteMany({ where: { id: shops } });
  await db.$disconnect();
});

const search = (query: string, limit = 20) => searchProducts(shopId, { query, limit });

describe("searchProducts", () => {
  it("offers only sellable batches, earliest expiry first", async () => {
    const { products } = await search("zeta");
    expect(products).toHaveLength(1);
    expect(products[0].batches.map((b) => b.batchNumber)).toEqual(["TODAY", "SOON", "LATE"]);
    expect(products[0].sellableStock).toBe(45);
    expect(products[0].batches.map((b) => b.isExpiringSoon)).toEqual([true, true, false]);
  });

  it("gives per-pack and per-loose-unit prices using the bill's rounding", async () => {
    const [zeta] = (await search("zeta")).products;
    expect(zeta.batches[0]).toMatchObject({ sellingPrice: "20.00", mrp: "20.00", unitSellingPrice: "1.33" });
    const [syrup] = (await search("paracold")).products;
    expect(syrup.batches[0]).toMatchObject({ sellingPrice: "18.50", unitSellingPrice: null }); // sold whole only
  });

  it("matches generic names, shows out-of-stock medicines last, and hides inactive ones", async () => {
    const { products } = await search("paracetamol");
    expect(products.map((p) => p.name)).toEqual(["Paracold Syrup", "Zeta Paracip", "Paraxin Out"]);
    expect(products.at(-1)).toMatchObject({ sellableStock: 0, batches: [] });
    expect(products.map((p) => p.name)).not.toContain("Paradox Retired");
  });

  it("ranks names starting with the query first", async () => {
    const names = (await search("para")).products.map((p) => p.name);
    // "Paracold" and "Paraxin" start with "para"; "Zeta Paracip" only contains it.
    expect(names).toEqual(["Paracold Syrup", "Paraxin Out", "Zeta Paracip"]);
  });

  it("recognises a scanned barcode, in this shop only", async () => {
    const result = await search("8900000000017");
    expect(result.products.map((p) => p.name)).toEqual(["Zeta Paracip"]);
    expect(result.barcodeMatchId).toBe(result.products[0].id);
    expect((await search("89000")).barcodeMatchId).toBeNull(); // prefix: listed, but not auto-added
  });

  it("respects the limit and returns nothing for an empty query", async () => {
    expect((await search("para", 1)).products).toHaveLength(1);
    expect(await search("   ")).toEqual({ products: [], barcodeMatchId: null });
  });

  it("never returns another shop's medicines", async () => {
    const names = (await search("paracetamol")).products.map((p) => p.name);
    expect(names).not.toContain("Paracetamol Other Shop");
    const other = await searchProducts(otherShopId, { query: "zeta", limit: 20 });
    expect(other.products).toEqual([]);
  });
});
