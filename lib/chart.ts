// Pure helpers for charts: clean axis ticks and compact labels. No React, so they are unit-tested.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Round-number ticks from 0 that cover `max` in about `target` steps: 437 → [0, 100, 200, 300, 400, 500].
 * Steps are 1, 2, 2.5 or 5 × a power of ten. With nothing to show, a 0–100 axis.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 25, 50, 75, 100];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  const top = Math.ceil(max / step - 1e-9) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Number((i * step).toFixed(6)));
}

/** Axis label in rupees, Indian style: ₹0, ₹500, ₹2.5K, ₹40K, ₹1.2L, ₹2Cr. */
export function formatAxisINR(value: number): string {
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (value >= 1_00_00_000) return `₹${trim(value / 1_00_00_000)}Cr`;
  if (value >= 1_00_000) return `₹${trim(value / 1_00_000)}L`;
  if (value >= 1_000) return `₹${trim(value / 1_000)}K`;
  return `₹${trim(value)}`;
}

/** "2026-10-06" → "6 Oct" */
export function formatShortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "2026-10-06" → "Tue 6" */
export function formatWeekdayDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "2026-10-06" → "Tue, 6 Oct 2026" (tooltips and the table view). */
export function formatLongDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
