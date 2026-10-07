// Add/Edit Medicine form: what the user types (packs, loose units, text fields) ↔ the API input (units).
// Validation reuses the server schemas so the form shows exactly the messages the server would.
import { z } from "zod";
import { addBatchIssues, emptyBatchForm, toBatchFields, toNumber, type BatchFormValues } from "@/lib/batch-form";
import { createMedicineSchema, medicineFieldsSchema, updateMedicineSchema } from "@/lib/validations";

// What the API accepts (before the server trims, upper-cases and re-validates).
export type CreateMedicineRequest = z.input<typeof createMedicineSchema>;
export type MedicineFieldsRequest = z.input<typeof updateMedicineSchema>["data"];

// Pack types for the "Pack type" dropdown. `value` is stored as Medicine.packLabel and shown elsewhere
// ("5 bottles", "MRP per jar"); `label` is only the dropdown text.
export const PACK_TYPES = [
  { value: "strip", label: "Strip" },
  { value: "bottle", label: "Bottle/Syrups/Drops" },
  { value: "tube", label: "Tube/Creams" },
  { value: "sachet", label: "Sachet/Powders" },
  { value: "box", label: "Box/Carton" },
  { value: "vial", label: "Vial/Injec" },
  { value: "pack", label: "Pack" },
  { value: "perfume", label: "Perfume" },
  { value: "kit", label: "Kit" },
  { value: "jar", label: "Cerelac/Boost/Horlicks" },
  { value: "veterinary", label: "Veterinary" },
  { value: "general", label: "General" },
] as const;
// Pack types whose unit is typed freely (optional) instead of picked from UNIT_LABELS.
export const FREE_UNIT_PACKS: ReadonlySet<string> = new Set(["veterinary", "general"]);
export const MEDICINE_TYPES = [
  { value: "GENERIC", label: "Generic" },
  { value: "ETHICAL", label: "Ethical" },
] as const;
export const UNIT_LABELS = ["tablet", "capsule", "unit"] as const;
// Current common GST slabs for medicines and related goods; any 0–100 rate is still accepted by the server.
export const GST_RATES = ["0", "5", "12", "18", "28", "40"] as const;

export type MedicineFormValues = {
  name: string;
  genericName: string;
  category: string;
  manufacturer: string;
  barcode: string;
  // "" = not set.
  medicineType: "" | "GENERIC" | "ETHICAL";
  gstRate: string;
  packLabel: string;
  unitLabel: string;
  packSize: string;
  minimumPacks: string;
  // Opening stock (Add only): the batch fields below.
  addBatch: boolean;
} & BatchFormValues;

export const emptyMedicineForm: MedicineFormValues = {
  name: "",
  genericName: "",
  category: "",
  manufacturer: "",
  barcode: "",
  medicineType: "",
  gstRate: "5",
  packLabel: "strip",
  unitLabel: "tablet",
  packSize: "10",
  minimumPacks: "0",
  addBatch: true,
  ...emptyBatchForm,
};

export function toMedicineFields(values: MedicineFormValues) {
  const packSize = toNumber(values.packSize);
  return {
    name: values.name,
    genericName: values.genericName,
    category: values.category,
    manufacturer: values.manufacturer,
    barcode: values.barcode,
    medicineType: values.medicineType || null,
    gstRate: values.gstRate,
    packSize,
    unitLabel: unitLabelFor(values, packSize),
    packLabel: values.packLabel,
    minimumStock: toNumber(values.minimumPacks || "0") * packSize,
  };
}

function unitLabelFor(values: MedicineFormValues, packSize: number) {
  // Items sold whole (packSize 1) are counted in packs: "bottle", "sachet", …
  if (packSize === 1) return values.packLabel;
  // Veterinary / general: the unit is optional free text.
  if (FREE_UNIT_PACKS.has(values.packLabel)) return values.unitLabel.trim() || "unit";
  return values.unitLabel;
}

// Server field → form field, for showing server-schema errors next to the right input.
const MEDICINE_PATHS: Record<string, keyof MedicineFormValues> = { minimumStock: "minimumPacks" };

export const medicineFormSchema = z
  .custom<MedicineFormValues>()
  .superRefine((values, ctx) => {
    const medicine = medicineFieldsSchema.safeParse(toMedicineFields(values));
    if (!medicine.success) {
      for (const issue of medicine.error.issues) {
        const field = String(issue.path[0]);
        ctx.addIssue({ code: "custom", path: [MEDICINE_PATHS[field] ?? field], message: issue.message });
      }
    }
    if (values.addBatch) addBatchIssues(values, toNumber(values.packSize), ctx);
  });

/** Valid form values → API input for inventory.create. */
export function toCreateMedicineInput(values: MedicineFormValues): CreateMedicineRequest {
  const fields = toMedicineFields(values);
  return { ...fields, firstBatch: values.addBatch ? toBatchFields(values, fields.packSize) : undefined };
}

/** Valid form values → API input for inventory.update (medicine details only). */
export function toUpdateMedicineFields(values: MedicineFormValues): MedicineFieldsRequest {
  return toMedicineFields(values);
}

/** Existing medicine → form values for editing. */
export function medicineToFormValues(medicine: {
  name: string;
  genericName: string | null;
  category: string | null;
  manufacturer: string | null;
  barcode: string | null;
  medicineType: "GENERIC" | "ETHICAL" | null;
  gstRate: string;
  packSize: number;
  unitLabel: string;
  packLabel: string;
  minimumStock: number;
}): MedicineFormValues {
  return {
    ...emptyMedicineForm,
    name: medicine.name,
    genericName: medicine.genericName ?? "",
    category: medicine.category ?? "",
    manufacturer: medicine.manufacturer ?? "",
    barcode: medicine.barcode ?? "",
    medicineType: medicine.medicineType ?? "",
    gstRate: String(Number(medicine.gstRate)),
    packSize: String(medicine.packSize),
    unitLabel: medicine.packSize === 1 ? emptyMedicineForm.unitLabel : medicine.unitLabel,
    packLabel: medicine.packLabel,
    minimumPacks: String(Math.ceil(medicine.minimumStock / medicine.packSize)),
    addBatch: false,
  };
}
