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

/** Expiry dates are stored as UTC midnight dates: 2027-03-31 → "Mar 2027". */
export function formatExpiry(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "5.00" / "5" → "5%", "12.5" → "12.5%" */
export function formatPercent(rate: string): string {
  return `${Number(rate)}%`;
}
