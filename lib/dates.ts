// Dates for an Indian shop. Expiry dates are stored as plain dates (UTC midnight, like Prisma's @db.Date),
// so "today" must also be the Indian calendar date at UTC midnight before comparing.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Today's date in India as a UTC-midnight Date.
export function todayInIndia(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

// "2027-03" (as printed on packs / from <input type="month">) → 2027-03-31, the last day it can be sold.
export function expiryMonthToDate(month: string): Date {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex, 0));
}

// 2027-03-31 → "2027-03"
export function dateToExpiryMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------------------------
// Date ranges by the Indian calendar day, for filtering timestamps (sales are stored as UTC instants).

/** "2026-10-06" → the instant that day starts in India (00:00 IST = 18:30 UTC the day before). */
export function indiaDayStart(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** The Indian calendar date of an instant as "YYYY-MM-DD". */
export function indiaIsoDate(instant: Date = new Date()): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export type SalesPeriod = "today" | "week" | "month" | "custom" | "all";

/**
 * [start, end) instants for a period, by the Indian calendar. "week" runs Monday → today, "month" the 1st → today,
 * "custom" from → to (both days included). Returns null for "all". Also returns the first and last day covered.
 */
export function salesPeriodRange(
  period: SalesPeriod,
  custom: { from?: string; to?: string } = {},
  now: Date = new Date(),
): { start: Date; end: Date; from: string; to: string } | null {
  if (period === "all") return null;
  const today = indiaIsoDate(now);
  const day = (iso: string, offset: number) => indiaIsoDate(new Date(indiaDayStart(iso).getTime() + offset * DAY_MS));

  let from = today;
  let to = today;
  if (period === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    from = day(today, -((weekday + 6) % 7));
  } else if (period === "month") {
    from = `${today.slice(0, 8)}01`;
  } else if (period === "custom") {
    from = custom.from ?? today;
    to = custom.to ?? from;
  }
  return { start: indiaDayStart(from), end: indiaDayStart(day(to, 1)), from, to };
}
