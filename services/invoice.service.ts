import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { formatInvoiceNumber } from "@/lib/invoice";

/**
 * Reserves the next invoice number for a shop and financial year. Call it inside the sale transaction:
 * if the sale fails, the transaction rolls back and the number is not used.
 *
 * One atomic statement (insert the counter, or add 1 to it, and return the new value), so simultaneous sales —
 * even the very first sale of a year — can never get the same number. Concurrent callers queue on the counter row
 * until the first transaction finishes.
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, shopId: string, fy: string): Promise<string> {
  const [{ lastNumber }] = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "InvoiceCounter" ("shopId", "financialYear", "lastNumber")
    VALUES (${shopId}, ${fy}, 1)
    ON CONFLICT ("shopId", "financialYear")
    DO UPDATE SET "lastNumber" = "InvoiceCounter"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  return formatInvoiceNumber(fy, Number(lastNumber));
}
