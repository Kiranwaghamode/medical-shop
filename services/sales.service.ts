import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { allocateCart, priceCart, type CartProduct } from "@/lib/cart";
import { addDays, dateToExpiryMonth, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { plural } from "@/lib/format";
import { financialYear } from "@/lib/invoice";
import { EXPIRY_WARNING_DAYS } from "@/lib/inventory-status";
import { fromPaise, PricingError, unitPricePaise } from "@/lib/pricing";
import type { CreateSaleInput, ProductSearchInput } from "@/lib/validations";
import { nextInvoiceNumber } from "@/services/invoice.service";

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

  const products = await loadProducts(
    {
      shopId,
      isActive: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { genericName: { contains: query, mode: "insensitive" } },
        { barcode: { startsWith: query } },
      ],
    },
    // Enough candidates to rank (a shop has a few thousand medicines at most); cut to `limit` after ranking.
    Math.max(100, input.limit * 5),
  );

  const lower = query.toLowerCase();
  const ranked = products
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
  const barcodeMatch = ranked.find((p) => p.barcode === query);
  return { products: ranked, barcodeMatchId: barcodeMatch?.id ?? null };
}

/**
 * Fresh stock and prices for medicines already in the cart (e.g. after a sale was refused because stock changed).
 * Deactivated medicines are included, so the POS can tell the user instead of silently dropping them.
 */
export async function getProducts(shopId: string, ids: string[]) {
  return loadProducts({ shopId, id: { in: ids } });
}

/** Medicines as the POS needs them: sellable batches only (not expired, stock > 0), earliest expiry first. */
async function loadProducts(where: Prisma.MedicineWhereInput, take?: number): Promise<(Product & { isActive: boolean })[]> {
  const today = todayInIndia();
  const soonLimit = addDays(today, EXPIRY_WARNING_DAYS);

  const medicines = await db.medicine.findMany({
    where,
    take,
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
      isActive: true,
      batches: {
        where: { expiryDate: { gte: today }, quantity: { gt: 0 } },
        orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
        select: { id: true, batchNumber: true, expiryDate: true, quantity: true, mrp: true, sellingPrice: true },
      },
    },
  });

  return medicines.map((medicine) => {
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
  });
}

// ---------------------------------------------------------------------------------------------
// Completing a sale

export type CreatedSale = { id: string; invoiceNumber: string; total: string };

const createdSelect = { id: true, invoiceNumber: true, total: true } as const;
const toCreated = (sale: { id: string; invoiceNumber: string; total: Prisma.Decimal }): CreatedSale => ({
  ...sale,
  total: sale.total.toFixed(2),
});

/**
 * Completes a sale in ONE transaction: reads live stock and prices, re-runs the cart allocation and the bill
 * (lib/cart.ts, lib/pricing.ts — nothing priced by the client is trusted), deducts stock with a guarded update,
 * takes the next invoice number and saves the sale with its lines. Any failure rolls all of it back.
 *
 * The same clientRequestId returns the sale already saved, so a double-click or a retried request can't bill twice.
 */
export async function createSale(shopId: string, userId: string, input: CreateSaleInput): Promise<CreatedSale> {
  const duplicate = () =>
    db.sale.findUnique({
      where: { shopId_clientRequestId: { shopId, clientRequestId: input.clientRequestId } },
      select: createdSelect,
    });

  const existing = await duplicate();
  if (existing) return toCreated(existing);

  try {
    const sale = await db.$transaction(
      async (tx) => {
        const today = todayInIndia();
        const medicineIds = [...new Set(input.items.map((item) => item.medicineId))];

        // Live stock and prices: sellable batches only, earliest expiry first.
        const medicines = await tx.medicine.findMany({
          where: { id: { in: medicineIds }, shopId },
          select: {
            id: true,
            name: true,
            isActive: true,
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

        const byId = new Map(medicines.map((m) => [m.id, m]));
        for (const item of input.items) {
          const medicine = byId.get(item.medicineId);
          if (!medicine) throw new AppError("NOT_FOUND", "A medicine in the cart no longer exists. Remove it and try again.");
          if (!medicine.isActive) throw new AppError("CONFLICT", `${medicine.name} has been deactivated and can't be sold.`);
          if (item.soldBy === "UNIT" && medicine.packSize === 1) {
            throw new AppError("BAD_REQUEST", `${medicine.name} can only be sold whole.`);
          }
          if (item.batchId && !medicine.batches.some((b) => b.id === item.batchId)) {
            throw new AppError("CONFLICT", `The chosen batch of ${medicine.name} has expired or has no stock left.`);
          }
        }

        const products = new Map<string, CartProduct>(
          medicines.map((m) => [
            m.id,
            {
              ...m,
              gstRate: m.gstRate.toString(),
              batches: m.batches.map((b) => ({ ...b, mrp: b.mrp.toFixed(2), sellingPrice: b.sellingPrice.toFixed(2) })),
            },
          ]),
        );

        const { allocations, shortages } = allocateCart(input.items, products);
        if (shortages.length > 0) {
          const details = shortages.map(({ itemKey, missing }) => {
            const item = input.items.find((i) => i.key === itemKey)!;
            const medicine = byId.get(item.medicineId)!;
            const word = item.soldBy === "PACK" ? medicine.packLabel : medicine.unitLabel;
            return `${medicine.name} (${missing} ${plural(word, missing)} short)`;
          });
          throw new AppError("CONFLICT", `Not enough stock: ${details.join(", ")}.`);
        }

        let bill;
        try {
          bill = priceCart(allocations, products, input.discount);
        } catch (error) {
          if (error instanceof PricingError) throw new AppError("BAD_REQUEST", error.message);
          throw error;
        }

        // Deduct stock. The guard (enough stock, not expired) is re-checked by the update itself, so a sale that
        // committed a moment ago can't be oversold. Batches are updated in a fixed order to avoid deadlocks.
        const deductions = new Map<string, number>();
        for (const a of allocations) deductions.set(a.batchId, (deductions.get(a.batchId) ?? 0) + a.unitsDeducted);
        for (const [batchId, units] of [...deductions].sort(([a], [b]) => a.localeCompare(b))) {
          const { count } = await tx.inventoryBatch.updateMany({
            where: { id: batchId, quantity: { gte: units }, expiryDate: { gte: today } },
            data: { quantity: { decrement: units } },
          });
          if (count === 0) {
            throw new AppError("CONFLICT", "Stock changed while this bill was being saved (another sale just used it). Please try again.");
          }
        }

        const fy = financialYear();
        const invoiceNumber = await nextInvoiceNumber(tx, shopId, fy);

        return tx.sale.create({
          data: {
            shopId,
            userId,
            clientRequestId: input.clientRequestId,
            invoiceNumber,
            financialYear: fy,
            subtotal: bill.subtotal,
            discountType: input.discount?.type ?? null,
            discountValue: input.discount?.value ?? null,
            discount: bill.discount,
            taxTotal: bill.taxTotal,
            total: bill.total,
            paymentMethod: input.paymentMethod,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            doctorName: input.doctorName,
            items: {
              create: allocations.map((allocation, i) => {
                const medicine = byId.get(allocation.medicineId)!;
                const batch = medicine.batches.find((b) => b.id === allocation.batchId)!;
                const line = bill.lines[i];
                return {
                  medicineId: medicine.id,
                  batchId: batch.id,
                  // Snapshots, so the bill never changes when the medicine or batch is edited later.
                  medicineName: medicine.name,
                  batchNumber: batch.batchNumber,
                  expiryDate: batch.expiryDate,
                  mrp: line.unitMrp,
                  gstRate: line.gstRate,
                  soldBy: line.soldBy,
                  quantity: line.quantity,
                  unitsDeducted: line.unitsDeducted,
                  unitPrice: line.unitPrice,
                  lineTotal: line.lineTotal,
                  discountAmount: line.discount,
                  taxAmount: line.taxAmount,
                };
              }),
            },
          },
          select: createdSelect,
        });
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    return toCreated(sale);
  } catch (error) {
    if (error instanceof AppError) throw error;
    // The same request arrived twice at once and the other copy saved first.
    const details = error instanceof Error ? `${error.message} ${JSON.stringify((error as { meta?: unknown }).meta ?? {})}` : "";
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && details.includes("clientRequestId")) {
      const saved = await duplicate();
      if (saved) return toCreated(saved);
    }
    // Two sales locked the same rows and the database had to cancel one of them.
    if (/deadlock|could not serialize/i.test(details)) {
      throw new AppError("CONFLICT", "Another sale was being saved at the same moment. Please try again.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Reading a sale (bill)

/** One saved sale with everything its bill shows, including GST per rate. Only the caller's shop. */
export async function getSale(shopId: string, id: string) {
  const sale = await db.sale.findFirst({
    where: { id, shopId },
    include: {
      shop: { select: { name: true, address: true, phone: true, gstin: true } },
      user: { select: { email: true } },
      // Lines were created in bill order; cuid ids sort in creation order.
      items: { orderBy: { id: "asc" }, include: { medicine: { select: { unitLabel: true, packLabel: true } } } },
    },
  });
  if (!sale) throw new AppError("NOT_FOUND", "Sale not found.");

  const money = (value: Prisma.Decimal) => value.toFixed(2);

  // GST summary: taxable value (paid − GST) and GST for each rate.
  const byRate = new Map<string, { taxable: Prisma.Decimal; tax: Prisma.Decimal }>();
  for (const item of sale.items) {
    const rate = item.gstRate.toString();
    const paid = item.lineTotal.minus(item.discountAmount);
    const entry = byRate.get(rate) ?? { taxable: new Prisma.Decimal(0), tax: new Prisma.Decimal(0) };
    byRate.set(rate, { taxable: entry.taxable.plus(paid.minus(item.taxAmount)), tax: entry.tax.plus(item.taxAmount) });
  }

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    createdAt: sale.createdAt,
    paymentMethod: sale.paymentMethod,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    doctorName: sale.doctorName,
    cashier: sale.user.email,
    shop: sale.shop,
    discountType: sale.discountType,
    discountValue: sale.discountValue?.toString() ?? null,
    subtotal: money(sale.subtotal),
    discount: money(sale.discount),
    taxTotal: money(sale.taxTotal),
    total: money(sale.total),
    items: sale.items.map((item) => ({
      id: item.id,
      medicineName: item.medicineName,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      soldBy: item.soldBy,
      quantity: item.quantity,
      unitLabel: item.medicine.unitLabel,
      packLabel: item.medicine.packLabel,
      gstRate: item.gstRate.toString(),
      mrp: money(item.mrp),
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
      discountAmount: money(item.discountAmount),
      taxAmount: money(item.taxAmount),
    })),
    gstSummary: [...byRate]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([rate, { taxable, tax }]) => ({ rate, taxable: money(taxable), tax: money(tax) })),
  };
}
