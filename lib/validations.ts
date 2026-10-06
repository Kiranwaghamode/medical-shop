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

// ---------------------------------------------------------------------------------------------
// Sales / POS

export const productSearchSchema = z.object({
  query: z.string().trim().max(100),
  limit: z.number().int().min(1).max(50).default(20),
});
export type ProductSearchInput = z.output<typeof productSearchSchema>;

// What the POS sends to complete a sale. No prices or totals: the server reads them from the database.
export const createSaleSchema = z.object({
  // One-time ID per sale (double-click / retry protection).
  clientRequestId: z.string().min(8).max(64),
  items: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        medicineId: z.string().min(1),
        soldBy: z.enum(["PACK", "UNIT"]),
        quantity: wholeNumber().min(1, "Quantity must be at least 1").max(100_000),
        // null = take from the batches that expire first.
        batchId: z.string().min(1).nullable(),
      }),
    )
    .min(1, "The cart is empty")
    .max(200, "Too many lines on one bill"),
  discount: z
    .object({ type: z.enum(["PERCENT", "AMOUNT"]), value: z.string().trim().max(20) })
    .nullable()
    .transform((d) => (d && d.value !== "" ? d : null)),
  paymentMethod: z.enum(["CASH", "UPI", "CARD"]),
  customerName: optionalText(100),
  customerPhone: z
    .string()
    .trim()
    .max(15, "Must be 15 characters or fewer")
    .regex(/^[0-9+\- ]*$/, "Use only digits, spaces, + and -")
    .optional()
    .transform((value) => value || null),
  doctorName: optionalText(100),
});
export type CreateSaleInput = z.output<typeof createSaleSchema>;

export const saleIdSchema = z.object({ id });
export const productIdsSchema = z.object({ ids: z.array(id).min(1).max(200) });

// ---------------------------------------------------------------------------------------------
// Settings

// GSTIN: 2-digit state code + PAN (5 letters, 4 digits, 1 letter) + entity number + "Z" + check character.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const shopSettingsSchema = z.object({
  name: z.string().trim().min(1, "Shop name is required").max(100, "Must be 100 characters or fewer"),
  address: optionalText(300),
  phone: z
    .string()
    .trim()
    .max(40, "Must be 40 characters or fewer")
    .regex(/^[0-9+\-/, ]*$/, "Use only digits, spaces, + - / and commas")
    .optional()
    .transform((value) => value || null),
  gstin: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === "" || GSTIN_PATTERN.test(value), "Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5")
    .optional()
    .transform((value) => value || null),
  drugLicenseNumber: optionalText(100),
  billFooter: optionalText(200),
  billPaperSize: z.enum(["A4", "A5"]),
  autoPrint: z.boolean(),
});
export type ShopSettingsInput = z.output<typeof shopSettingsSchema>;

const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Choose a date");

export const salesListSchema = z
  .object({
    // Invoice number, customer name or phone.
    search: z.string().trim().max(100).optional(),
    period: z.enum(["today", "week", "month", "custom", "all"]).default("today"),
    // Indian calendar dates, both included; only for period = "custom".
    from: isoDate.optional(),
    to: isoDate.optional(),
    paymentMethod: z.enum(["CASH", "UPI", "CARD"]).optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(25),
  })
  .refine((input) => input.period !== "custom" || (input.from && input.to), {
    path: ["from"],
    message: "Choose both dates",
  })
  .refine((input) => !input.from || !input.to || input.from <= input.to, {
    path: ["to"],
    message: "The end date is before the start date",
  });
export type SalesListInput = z.output<typeof salesListSchema>;
