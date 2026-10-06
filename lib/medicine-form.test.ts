import { describe, expect, it } from "vitest";
import {
  emptyMedicineForm,
  medicineFormSchema,
  medicineToFormValues,
  toCreateMedicineInput,
  type MedicineFormValues,
} from "@/lib/medicine-form";
import { createMedicineSchema } from "@/lib/validations";

const dolo: MedicineFormValues = {
  ...emptyMedicineForm,
  name: "Dolo 650",
  genericName: "Paracetamol 650 mg",
  packSize: "15",
  minimumPacks: "30",
  batchNumber: "dl26c11",
  expiryMonth: "2028-04",
  mrp: "33.60",
  sellingPrice: "",
  purchasePrice: "24.50",
  packs: "100",
  loose: "7",
};

const errors = (values: MedicineFormValues) => {
  const result = medicineFormSchema.safeParse(values);
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));
};

describe("medicine form → API input", () => {
  it("converts packs to units and fills in defaults (as the server will store it)", () => {
    expect(errors(dolo)).toEqual({});
    // The form sends raw values; the server's schema trims, upper-cases and turns blanks into null.
    expect(createMedicineSchema.parse(toCreateMedicineInput(dolo))).toEqual({
      name: "Dolo 650",
      genericName: "Paracetamol 650 mg",
      category: null,
      manufacturer: null,
      barcode: null,
      gstRate: "5",
      packSize: 15,
      unitLabel: "tablet",
      packLabel: "strip",
      minimumStock: 450, // 30 strips × 15
      firstBatch: {
        batchNumber: "DL26C11",
        expiryMonth: "2028-04",
        mrp: "33.60",
        sellingPrice: "33.60", // blank = MRP
        purchasePrice: "24.50",
        quantity: 1507, // 100 × 15 + 7
      },
    });
  });

  it("counts whole-only items (pack size 1) in packs, ignoring loose", () => {
    const syrup = { ...dolo, packLabel: "bottle", packSize: "1", loose: "3", packs: "12", minimumPacks: "8" };
    const input = toCreateMedicineInput(syrup);
    expect(input).toMatchObject({ unitLabel: "bottle", packLabel: "bottle", minimumStock: 8 });
    expect(input.firstBatch?.quantity).toBe(12);
  });

  it("leaves out the batch when opening stock is switched off, and ignores its empty fields", () => {
    const noStock = { ...dolo, addBatch: false, batchNumber: "", mrp: "", packs: "" };
    expect(errors(noStock)).toEqual({});
    expect(toCreateMedicineInput(noStock).firstBatch).toBeUndefined();
  });
});

describe("medicine form validation", () => {
  it("shows server-rule messages on the matching form fields", () => {
    expect(errors({ ...dolo, name: "" })).toMatchObject({ name: "Name is required" });
    expect(errors({ ...dolo, sellingPrice: "40" })).toMatchObject({ sellingPrice: "Selling price can't be more than MRP" });
    expect(errors({ ...dolo, expiryMonth: "" })).toMatchObject({ expiryMonth: "Choose the expiry month" });
    expect(errors({ ...dolo, packs: "-1" })).toMatchObject({ packs: "Can't be negative" });
    expect(errors({ ...dolo, minimumPacks: "-2" })).toMatchObject({ minimumPacks: "Can't be negative" });
    expect(errors({ ...dolo, packSize: "" })).toMatchObject({ packSize: "Must be a whole number" });
  });

  it("requires loose units to be less than a full pack", () => {
    expect(errors({ ...dolo, loose: "15" })).toMatchObject({ loose: "Enter 0 to 14" });
    expect(errors({ ...dolo, loose: "14" })).toEqual({});
  });
});

describe("editing an existing medicine", () => {
  it("turns stored units back into packs", () => {
    const values = medicineToFormValues({
      name: "Dolo 650", genericName: null, category: "Analgesic", manufacturer: null, barcode: "890",
      gstRate: "5", packSize: 15, unitLabel: "tablet", packLabel: "strip", minimumStock: 450,
    });
    expect(values).toMatchObject({ genericName: "", category: "Analgesic", minimumPacks: "30", packSize: "15", addBatch: false });
  });
});
