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
