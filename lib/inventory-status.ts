import { addDays } from "@/lib/dates";

// Batches expiring within this many days are flagged "expiring soon" (plan §17).
export const EXPIRY_WARNING_DAYS = 30;

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "INACTIVE";

export type StockSummary = {
  // Units in batches that have not expired — the only stock that can be sold.
  sellableStock: number;
  // Units in expired batches (still on the shelf, must not be sold).
  expiredStock: number;
  // Sellable units that expire within EXPIRY_WARNING_DAYS.
  expiringSoonStock: number;
  // Earliest expiry among sellable batches that still have stock.
  nearestExpiry: Date | null;
  status: StockStatus;
};

type BatchLike = { quantity: number; expiryDate: Date };

/** Stock figures and status for one medicine. `today` comes from todayInIndia(). */
export function summarizeStock(
  medicine: { isActive: boolean; minimumStock: number },
  batches: BatchLike[],
  today: Date,
): StockSummary {
  const soonLimit = addDays(today, EXPIRY_WARNING_DAYS);
  let sellableStock = 0;
  let expiredStock = 0;
  let expiringSoonStock = 0;
  let nearestExpiry: Date | null = null;

  for (const batch of batches) {
    if (batch.quantity <= 0) continue;
    // A batch can be sold up to and including its expiry date.
    if (batch.expiryDate < today) {
      expiredStock += batch.quantity;
      continue;
    }
    sellableStock += batch.quantity;
    if (batch.expiryDate <= soonLimit) expiringSoonStock += batch.quantity;
    if (!nearestExpiry || batch.expiryDate < nearestExpiry) nearestExpiry = batch.expiryDate;
  }

  let status: StockStatus;
  if (!medicine.isActive) status = "INACTIVE";
  else if (sellableStock === 0) status = "OUT_OF_STOCK";
  else if (medicine.minimumStock > 0 && sellableStock < medicine.minimumStock) status = "LOW_STOCK";
  else status = "IN_STOCK";

  return { sellableStock, expiredStock, expiringSoonStock, nearestExpiry, status };
}

/** 125 tablets at 15 per strip → { packs: 8, loose: 5 }. */
export function splitIntoPacks(units: number, packSize: number): { packs: number; loose: number } {
  return { packs: Math.floor(units / packSize), loose: units % packSize };
}
