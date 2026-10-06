// Invoice numbering: one sequence per shop per Indian financial year (1 April – 31 March, in IST).
// Format: INV-2026-27-000001.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The financial year a moment falls in, by the Indian calendar: 6 Oct 2026 → "2026-27", 15 Feb 2027 → "2026-27". */
export function financialYear(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  // January–March belong to the year that started the previous April.
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** ("2026-27", 1) → "INV-2026-27-000001". Numbers beyond 999999 simply get longer. */
export function formatInvoiceNumber(fy: string, sequence: number): string {
  return `INV-${fy}-${String(sequence).padStart(6, "0")}`;
}
