// Batch form (Add/Edit batch, and the "opening stock" part of Add medicine):
// what the user types (prices per pack, quantity as packs + loose units) ↔ API input (quantity in units).
import { z } from "zod";
import { batchFieldsSchema } from "@/lib/validations";

export type BatchFormValues = {
  batchNumber: string;
  expiryMonth: string;
  mrp: string;
  sellingPrice: string;
  purchasePrice: string;
  packs: string;
  loose: string;
};

export const emptyBatchForm: BatchFormValues = {
  batchNumber: "",
  expiryMonth: "",
  mrp: "",
  sellingPrice: "",
  purchasePrice: "",
  packs: "",
  loose: "",
};

// What the API accepts for a batch (before the server trims, upper-cases and re-validates).
export type BatchRequest = z.input<typeof batchFieldsSchema>;

// "" stays NaN so the schema reports "Must be a whole number" instead of silently using 0.
export const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value));

export function toBatchFields(values: BatchFormValues, packSize: number): BatchRequest {
  return {
    batchNumber: values.batchNumber,
    expiryMonth: values.expiryMonth,
    mrp: values.mrp,
    // Blank selling price = sell at MRP.
    sellingPrice: values.sellingPrice.trim() || values.mrp,
    purchasePrice: values.purchasePrice,
    quantity: toNumber(values.packs || "0") * packSize + (packSize > 1 ? toNumber(values.loose || "0") : 0),
  };
}

/** Adds batch errors (server rules + "loose must be less than a pack") to the matching form fields. */
export function addBatchIssues(values: BatchFormValues, packSize: number, ctx: z.RefinementCtx) {
  const batch = batchFieldsSchema.safeParse(toBatchFields(values, packSize));
  if (!batch.success) {
    for (const issue of batch.error.issues) {
      const field = String(issue.path[0]);
      // Quantity is typed as packs + loose; show quantity errors under "packs".
      ctx.addIssue({ code: "custom", path: [field === "quantity" ? "packs" : field], message: issue.message });
    }
  }
  const loose = toNumber(values.loose || "0");
  if (packSize > 1 && (!Number.isInteger(loose) || loose < 0 || loose >= packSize)) {
    ctx.addIssue({ code: "custom", path: ["loose"], message: `Enter 0 to ${packSize - 1}` });
  }
}

/** Form schema for one batch of a medicine with the given pack size. */
export function batchFormSchema(packSize: number) {
  return z.custom<BatchFormValues>().superRefine((values, ctx) => addBatchIssues(values, packSize, ctx));
}

/** Existing batch → form values for editing (units back to packs + loose). */
export function batchToFormValues(
  batch: { batchNumber: string; expiryMonth: string; mrp: string; sellingPrice: string; purchasePrice: string; quantity: number },
  packSize: number,
): BatchFormValues {
  return {
    batchNumber: batch.batchNumber,
    expiryMonth: batch.expiryMonth,
    mrp: batch.mrp,
    sellingPrice: batch.sellingPrice,
    purchasePrice: batch.purchasePrice,
    packs: String(Math.floor(batch.quantity / packSize)),
    loose: packSize > 1 ? String(batch.quantity % packSize) : "",
  };
}
