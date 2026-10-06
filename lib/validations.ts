// Shared Zod schemas: used by tRPC procedures (server-side validation) and by forms (same messages).
import { z } from "zod";

// Rupees with up to 2 decimals, as a string (exact; converted to Decimal on the server).
const money = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter an amount like 33.60");

// Whole numbers (counts); a blank or non-numeric input gets the same friendly message.
const wholeNumber = () => z.number({ error: "Must be a whole number" }).int("Must be a whole number");

// Optional text: empty input is stored as null.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((value) => value || null);

export const gstRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a GST rate like 5 or 18")
  .refine((value) => Number(value) <= 100, "GST rate can't be more than 100%");

export const medicineFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Must be 120 characters or fewer"),
  genericName: optionalText(200),
  category: optionalText(60),
  manufacturer: optionalText(120),
  barcode: z
    .string()
    .trim()
    .max(64, "Must be 64 characters or fewer")
    .regex(/^[A-Za-z0-9-]*$/, "Use only letters, digits and dashes")
    .optional()
    .transform((value) => value || null),
  gstRate: gstRateSchema,
  packSize: wholeNumber().min(1, "At least 1").max(1000, "At most 1000"),
  unitLabel: z.string().trim().min(1, "Required").max(20, "Must be 20 characters or fewer"),
  packLabel: z.string().trim().min(1, "Required").max(20, "Must be 20 characters or fewer"),
  // In units (e.g. tablets). 0 = no low-stock alert.
  minimumStock: wholeNumber().min(0, "Can't be negative").max(1_000_000),
});

export const batchFieldsSchema = z
  .object({
    batchNumber: z
      .string()
      .trim()
      .min(1, "Batch number is required")
      .max(40, "Must be 40 characters or fewer")
      .transform((value) => value.toUpperCase()),
    // "YYYY-MM" as printed on the pack; stored as the last day of that month.
    expiryMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the expiry month"),
    // Per pack, GST-inclusive.
    mrp: money,
    purchasePrice: money,
    sellingPrice: money,
    // In units (e.g. tablets).
    quantity: wholeNumber().min(0, "Can't be negative").max(10_000_000),
  })
  .refine((batch) => Number(batch.sellingPrice) <= Number(batch.mrp), {
    path: ["sellingPrice"],
    message: "Selling price can't be more than MRP",
  });

export const inventoryFilterSchema = z.enum(["all", "low", "out", "expiring", "expired", "inactive"]);

export const inventoryListSchema = z.object({
  search: z.string().trim().max(100).optional(),
  filter: inventoryFilterSchema.default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

const id = z.string().min(1);

export const createMedicineSchema = medicineFieldsSchema.extend({ firstBatch: batchFieldsSchema.optional() });
export const updateMedicineSchema = z.object({ id, data: medicineFieldsSchema });
export const medicineIdSchema = z.object({ id });
export const setMedicineActiveSchema = z.object({ id, isActive: z.boolean() });
export const addBatchSchema = z.object({ medicineId: id, data: batchFieldsSchema });
export const updateBatchSchema = z.object({ id, data: batchFieldsSchema });
export const batchIdSchema = z.object({ id });

export type MedicineFields = z.output<typeof medicineFieldsSchema>;
export type BatchFields = z.output<typeof batchFieldsSchema>;
export type InventoryFilter = z.output<typeof inventoryFilterSchema>;
export type InventoryListInput = z.output<typeof inventoryListSchema>;
export type CreateMedicineInput = z.output<typeof createMedicineSchema>;
