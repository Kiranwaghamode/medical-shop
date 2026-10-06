import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { addDays, dateToExpiryMonth, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { EXPIRY_WARNING_DAYS } from "@/lib/inventory-status";
import { fromPaise, unitPricePaise } from "@/lib/pricing";
import type { ProductSearchInput } from "@/lib/validations";

// Every function takes the caller's shopId first and only ever touches that shop's data.

export type ProductBatch = {
  id: string;
  batchNumber: string;
  expiryDate: Date;
  expiryMonth: string;
  isExpiringSoon: boolean;
  // Units available in this batch.
  quantity: number;
  // Per pack, as stored.
  mrp: string;
  sellingPrice: string;
  // Per loose unit (pack price ÷ pack size, rounded) — the same rule the bill uses. Null if sold whole only.
  unitSellingPrice: string | null;
};

export type Product = {
  id: string;
  name: string;
  genericName: string | null;
  manufacturer: string | null;
  barcode: string | null;
  gstRate: string;
  packSize: number;
  unitLabel: string;
  packLabel: string;
  // Units across sellable batches.
  sellableStock: number;
  // Sellable batches only (not expired, stock > 0), earliest expiry first — the order to sell them in (FEFO).
  batches: ProductBatch[];
};

/**
 * Counter search: active medicines matching the name, generic name or barcode, each with the batches that can be
 * sold right now. Out-of-stock medicines are still returned (with no batches) so the counter can say so.
 * Ranking: exact barcode match, then name starts with the query, then in stock, then name.
 */
export async function searchProducts(shopId: string, input: ProductSearchInput) {
  const query = input.query.trim();
  if (!query) return { products: [] as Product[], barcodeMatchId: null };

  const today = todayInIndia();
  const soonLimit = addDays(today, EXPIRY_WARNING_DAYS);

  const where: Prisma.MedicineWhereInput = {
    shopId,
    isActive: true,
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { genericName: { contains: query, mode: "insensitive" } },
      { barcode: { startsWith: query } },
    ],
  };

  const medicines = await db.medicine.findMany({
    where,
    // Enough candidates to rank (a shop has a few thousand medicines at most); cut to `limit` after ranking.
    take: Math.max(100, input.limit * 5),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      genericName: true,
      manufacturer: true,
      barcode: true,
      gstRate: true,
      packSize: true,
      unitLabel: true,
      packLabel: true,
      batches: {
        where: { expiryDate: { gte: today }, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
        select: { id: true, batchNumber: true, expiryDate: true, quantity: true, mrp: true, sellingPrice: true },
      },
    },
  });

  const lower = query.toLowerCase();
  const products = medicines
    .map((medicine): Product => {
      const batches = medicine.batches.map((batch) => ({
        id: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        expiryMonth: dateToExpiryMonth(batch.expiryDate),
        isExpiringSoon: batch.expiryDate <= soonLimit,
        quantity: batch.quantity,
        mrp: batch.mrp.toFixed(2),
        sellingPrice: batch.sellingPrice.toFixed(2),
        unitSellingPrice:
          medicine.packSize > 1
            ? fromPaise(unitPricePaise({ packSellingPrice: batch.sellingPrice.toFixed(2), packSize: medicine.packSize, soldBy: "UNIT" }))
            : null,
      }));
      return {
        ...medicine,
        gstRate: medicine.gstRate.toString(),
        sellableStock: batches.reduce((sum, b) => sum + b.quantity, 0),
        batches,
      };
    })
    .map((product) => ({
      product,
      rank: [
        product.barcode === query ? 0 : 1,
        product.name.toLowerCase().startsWith(lower) ? 0 : 1,
        product.sellableStock > 0 ? 0 : 1,
      ],
    }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.product.name.localeCompare(b.product.name))
    .slice(0, input.limit)
    .map(({ product }) => product);

  // A scanned barcode: the POS can add this product straight to the cart.
  const barcodeMatch = products.find((p) => p.barcode === query);
  return { products, barcodeMatchId: barcodeMatch?.id ?? null };
}
