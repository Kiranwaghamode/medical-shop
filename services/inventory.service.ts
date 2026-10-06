import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { dateToExpiryMonth, expiryMonthToDate, todayInIndia, addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { AppError, friendlyDbError } from "@/lib/errors";
import { EXPIRY_WARNING_DAYS, summarizeStock, type StockSummary } from "@/lib/inventory-status";
import type {
  BatchFields,
  CreateMedicineInput,
  InventoryFilter,
  InventoryListInput,
  MedicineFields,
} from "@/lib/validations";

// Every function takes the caller's shopId first and only ever touches that shop's data.
// Money leaves this service as strings ("33.60") so the UI never handles Decimal objects.

// Constraint names first, then the field names Prisma reports for unique violations.
const DB_MESSAGES: Record<string, string> = {
  Medicine_shopId_barcode_key: "Another medicine already uses this barcode.",
  InventoryBatch_medicineId_batchNumber_key: "This medicine already has a batch with that number.",
  InventoryBatch_sellingPrice_le_mrp_check: "Selling price can't be more than MRP.",
  InventoryBatch_quantity_check: "Stock can't be negative.",
  InventoryBatch_prices_check: "Prices can't be negative.",
  Medicine_gstRate_range_check: "GST rate must be between 0 and 100%.",
  Medicine_packSize_check: "Pack size must be at least 1.",
  "`barcode`": "Another medicine already uses this barcode.",
  "`batchNumber`": "This medicine already has a batch with that number.",
};

// Runs a write and converts known database errors into friendly AppErrors.
async function write<T>(operation: () => Promise<T>, notFoundMessage = "Not found."): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError("NOT_FOUND", notFoundMessage);
    }
    throw friendlyDbError(error, DB_MESSAGES) ?? error;
  }
}

const money = (value: Prisma.Decimal) => value.toFixed(2);

function medicineData(fields: MedicineFields) {
  return { ...fields, gstRate: new Prisma.Decimal(fields.gstRate) };
}

function batchData(fields: BatchFields) {
  const { expiryMonth, ...rest } = fields;
  return { ...rest, expiryDate: expiryMonthToDate(expiryMonth) };
}

// ---------------------------------------------------------------------------------------------
// Reading

export type MedicineListItem = {
  id: string;
  name: string;
  genericName: string | null;
  category: string | null;
  manufacturer: string | null;
  barcode: string | null;
  gstRate: string;
  packSize: number;
  unitLabel: string;
  packLabel: string;
  minimumStock: number;
  isActive: boolean;
  // MRP per pack across sellable batches, e.g. "33.60"; null when there are none.
  mrpMin: string | null;
  mrpMax: string | null;
} & StockSummary;

// "inactive" shows only deactivated medicines; every other filter applies to active ones.
export function matchesFilter(item: MedicineListItem, filter: InventoryFilter): boolean {
  if (filter === "inactive") return !item.isActive;
  if (!item.isActive) return false;
  switch (filter) {
    case "all":
      return true;
    case "low":
      return item.status === "LOW_STOCK";
    case "out":
      return item.status === "OUT_OF_STOCK";
    case "expiring":
      return item.expiringSoonStock > 0;
    case "expired":
      return item.expiredStock > 0;
  }
}

/**
 * Medicines matching the search, with stock figures. Active medicines unless filter is "inactive".
 * Status filters are computed in memory (stock depends on today's date); fine for a single shop's
 * catalogue of a few thousand medicines.
 */
export async function listMedicines(shopId: string, input: InventoryListInput) {
  // Active and inactive together, so every filter tab's count is always available.
  const all = await loadMedicineSummaries(shopId, input.search);
  const items = all.filter((item) => matchesFilter(item, input.filter));
  const start = (input.page - 1) * input.pageSize;

  return {
    items: items.slice(start, start + input.pageSize),
    total: items.length,
    page: input.page,
    pageSize: input.pageSize,
    // Counts for the filter tabs (within the current search).
    counts: {
      all: all.filter((i) => matchesFilter(i, "all")).length,
      low: all.filter((i) => matchesFilter(i, "low")).length,
      out: all.filter((i) => matchesFilter(i, "out")).length,
      expiring: all.filter((i) => matchesFilter(i, "expiring")).length,
      expired: all.filter((i) => matchesFilter(i, "expired")).length,
      inactive: all.filter((i) => matchesFilter(i, "inactive")).length,
    } satisfies Record<InventoryFilter, number>,
  };
}

/**
 * Every medicine of the shop (active and inactive, optionally matching a search) with its stock figures and status.
 * Shared by the inventory list and the dashboard alerts, so both always agree.
 */
export async function loadMedicineSummaries(shopId: string, search?: string): Promise<MedicineListItem[]> {
  const query = search?.trim();
  const searchWhere: Prisma.MedicineWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { genericName: { contains: query, mode: "insensitive" } },
          { barcode: { startsWith: query } },
        ],
      }
    : {};

  const medicines = await db.medicine.findMany({
    where: { shopId, ...searchWhere },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      genericName: true,
      category: true,
      manufacturer: true,
      barcode: true,
      gstRate: true,
      packSize: true,
      unitLabel: true,
      packLabel: true,
      minimumStock: true,
      isActive: true,
      batches: { select: { quantity: true, expiryDate: true, mrp: true } },
    },
  });

  const today = todayInIndia();
  return medicines.map(({ batches, gstRate, ...medicine }) => {
    const sellableMrps = batches.filter((b) => b.expiryDate >= today).map((b) => b.mrp);
    const sorted = [...sellableMrps].sort((a, b) => a.comparedTo(b));
    return {
      ...medicine,
      gstRate: gstRate.toString(),
      mrpMin: sorted.length ? money(sorted[0]) : null,
      mrpMax: sorted.length ? money(sorted[sorted.length - 1]) : null,
      ...summarizeStock(medicine, batches, today),
    };
  });
}

/** One medicine with all its batches (earliest expiry first). */
export async function getMedicine(shopId: string, id: string) {
  const medicine = await db.medicine.findFirst({
    where: { id, shopId },
    omit: { shopId: true },
    include: {
      batches: {
        orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
        include: { _count: { select: { saleItems: true } } },
      },
      _count: { select: { saleItems: true } },
    },
  });
  if (!medicine) throw new AppError("NOT_FOUND", "Medicine not found.");

  const today = todayInIndia();
  const soonLimit = addDays(today, EXPIRY_WARNING_DAYS);
  const { batches, gstRate, _count, ...rest } = medicine;

  return {
    ...rest,
    gstRate: gstRate.toString(),
    hasSales: _count.saleItems > 0,
    ...summarizeStock(medicine, batches, today),
    batches: batches.map(({ _count: batchCount, mrp, purchasePrice, sellingPrice, ...batch }) => ({
      ...batch,
      expiryMonth: dateToExpiryMonth(batch.expiryDate),
      mrp: money(mrp),
      purchasePrice: money(purchasePrice),
      sellingPrice: money(sellingPrice),
      isExpired: batch.expiryDate < today,
      isExpiringSoon: batch.expiryDate >= today && batch.expiryDate <= soonLimit,
      hasSales: batchCount.saleItems > 0,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Medicines

/** Creates a medicine, optionally with its first batch, in one step. */
export async function createMedicine(shopId: string, input: CreateMedicineInput) {
  const { firstBatch, ...fields } = input;
  return write(() =>
    db.medicine.create({
      data: {
        shopId,
        ...medicineData(fields),
        ...(firstBatch && { batches: { create: batchData(firstBatch) } }),
      },
      select: { id: true },
    }),
  );
}

export async function updateMedicine(shopId: string, id: string, fields: MedicineFields) {
  return write(
    () => db.medicine.update({ where: { id, shopId }, data: medicineData(fields), select: { id: true } }),
    "Medicine not found.",
  );
}

/** Deactivated medicines are hidden from sale but keep their history. */
export async function setMedicineActive(shopId: string, id: string, isActive: boolean) {
  return write(
    () => db.medicine.update({ where: { id, shopId }, data: { isActive }, select: { id: true, isActive: true } }),
    "Medicine not found.",
  );
}

/** Permanently deletes a medicine and its batches — only if it has never been sold. */
export async function deleteMedicine(shopId: string, id: string) {
  return db.$transaction(async (tx) => {
    const medicine = await tx.medicine.findFirst({
      where: { id, shopId },
      select: { id: true, _count: { select: { saleItems: true } } },
    });
    if (!medicine) throw new AppError("NOT_FOUND", "Medicine not found.");
    if (medicine._count.saleItems > 0) {
      throw new AppError("CONFLICT", "This medicine has been sold before, so it can't be deleted. Deactivate it instead.");
    }
    await tx.inventoryBatch.deleteMany({ where: { medicineId: id } });
    await tx.medicine.delete({ where: { id } });
    return { id };
  });
}

// ---------------------------------------------------------------------------------------------
// Batches

export async function addBatch(shopId: string, medicineId: string, fields: BatchFields) {
  const medicine = await db.medicine.findFirst({ where: { id: medicineId, shopId }, select: { id: true } });
  if (!medicine) throw new AppError("NOT_FOUND", "Medicine not found.");
  return write(() => db.inventoryBatch.create({ data: { medicineId, ...batchData(fields) }, select: { id: true } }));
}

export async function updateBatch(shopId: string, id: string, fields: BatchFields) {
  const batch = await db.inventoryBatch.findFirst({ where: { id, medicine: { shopId } }, select: { id: true } });
  if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");
  return write(() => db.inventoryBatch.update({ where: { id }, data: batchData(fields), select: { id: true } }));
}

/** Deletes a batch entered by mistake — only if nothing from it has been sold. */
export async function deleteBatch(shopId: string, id: string) {
  const batch = await db.inventoryBatch.findFirst({
    where: { id, medicine: { shopId } },
    select: { id: true, _count: { select: { saleItems: true } } },
  });
  if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");
  if (batch._count.saleItems > 0) {
    throw new AppError("CONFLICT", "This batch has been sold from, so it can't be deleted. Set its quantity to 0 instead.");
  }
  await db.inventoryBatch.delete({ where: { id } });
  return { id };
}
