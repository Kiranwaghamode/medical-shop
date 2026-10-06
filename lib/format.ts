// Display formatting shared by all screens (and later, bills). Pure functions, safe on client and server.
import { splitIntoPacks } from "@/lib/inventory-status";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const count = new Intl.NumberFormat("en-IN");

/** "1234.5" → "₹1,234.50" (Indian digit grouping). */
export function formatINR(amount: string | number): string {
  return inr.format(Number(amount));
}

/** 1807 → "1,807" */
export function formatCount(value: number): string {
  return count.format(value);
}

/** "tablet", 1 → "tablet"; "tablet", 3 → "tablets" */
export function plural(label: string, n: number): string {
  return n === 1 ? label : `${label}s`;
}

type PackInfo = { packSize: number; unitLabel: string; packLabel: string };

/** 1807 tablets at 15/strip → "120 strips + 7"; packSize 1 → "35 sachets". */
export function formatPacks(units: number, { packSize, unitLabel, packLabel }: PackInfo): string {
  if (packSize === 1) return `${formatCount(units)} ${plural(unitLabel, units)}`;
  const { packs, loose } = splitIntoPacks(units, packSize);
  if (packs === 0 && loose > 0) return `${loose} ${plural(unitLabel, loose)}`;
  const packText = `${formatCount(packs)} ${plural(packLabel, packs)}`;
  return loose ? `${packText} + ${loose}` : packText;
}

/** 1807 tablets → "1,807 tablets" */
export function formatUnits(units: number, unitLabel: string): string {
  return `${formatCount(units)} ${plural(unitLabel, units)}`;
}

// Fixed three-letter months: the en-IN locale writes "Sept", which looks inconsistent next to the others.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Expiry dates are stored as UTC midnight dates: 2027-03-31 → "Mar 2027". */
export function formatExpiry(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "5.00" / "5" → "5%", "12.5" → "12.5%" */
export function formatPercent(rate: string): string {
  return `${Number(rate)}%`;
}

/** A moment in Indian time: "6 Oct 2026, 4:30 pm". */
export function formatDateTime(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");
  const time = `${hours % 12 || 12}:${minutes} ${hours < 12 ? "am" : "pm"}`;
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${time}`;
}

/** Indian calendar days ("YYYY-MM-DD") as a short label: "6 Oct 2026", "1 – 6 Oct 2026", "28 Sep – 6 Oct 2026". */
export function formatDayRange(from: string, to: string): string {
  const parts = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()], year: d.getUTCFullYear() };
  };
  const a = parts(from);
  const b = parts(to);
  if (from === to) return `${b.day} ${b.month} ${b.year}`;
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  return `${a.day} – ${b.day} ${b.month} ${b.year}`;
}

/**
 * Change from a previous period, e.g. today vs yesterday: { label: "+12%", direction: "up" }.
 * No previous figure → no percentage (a % of zero means nothing).
 */
export function percentChange(current: string, previous: string): { label: string | null; direction: "up" | "down" | "flat" } {
  const now = Number(current);
  const before = Number(previous);
  if (before === 0) return { label: null, direction: now > 0 ? "up" : "flat" };
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return { label: "0%", direction: "flat" };
  return { label: `${change > 0 ? "+" : "−"}${Math.abs(change)}%`, direction: change > 0 ? "up" : "down" };
}
