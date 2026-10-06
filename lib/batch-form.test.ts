import { describe, expect, it } from "vitest";
import { batchFormSchema, batchToFormValues, toBatchFields, type BatchFormValues } from "@/lib/batch-form";
import { batchFieldsSchema } from "@/lib/validations";

const form: BatchFormValues = {
  batchNumber: "ab12",
  expiryMonth: "2029-01",
  mrp: "33.60",
  sellingPrice: "32",
  purchasePrice: "24.10",
  packs: "8",
  loose: "5",
};

const errors = (values: BatchFormValues, packSize: number) => {
  const result = batchFormSchema(packSize).safeParse(values);
  return Object.fromEntries((result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message]));
};

describe("batch form", () => {
  it("converts packs + loose to units", () => {
    expect(errors(form, 15)).toEqual({});
    expect(batchFieldsSchema.parse(toBatchFields(form, 15))).toEqual({
      batchNumber: "AB12",
      expiryMonth: "2029-01",
      mrp: "33.60",
      sellingPrice: "32",
      purchasePrice: "24.10",
      quantity: 125, // 8 × 15 + 5
    });
  });

  it("ignores loose units for items sold whole", () => {
    expect(toBatchFields(form, 1).quantity).toBe(8);
    expect(errors(form, 1)).toEqual({});
  });

  it("round-trips an existing batch for editing", () => {
    const stored = { batchNumber: "AB12", expiryMonth: "2029-01", mrp: "33.60", sellingPrice: "32.00", purchasePrice: "24.10", quantity: 125 };
    const values = batchToFormValues(stored, 15);
    expect(values).toMatchObject({ packs: "8", loose: "5" });
    expect(toBatchFields(values, 15).quantity).toBe(125);
    expect(batchToFormValues({ ...stored, quantity: 12 }, 1)).toMatchObject({ packs: "12", loose: "" });
  });

  it("reports errors on the fields the user typed", () => {
    expect(errors({ ...form, packs: "", loose: "" }, 15)).toEqual({}); // blank = 0 (e.g. setting stock to zero)
    expect(errors({ ...form, packs: "-1" }, 15)).toMatchObject({ packs: "Can't be negative" });
    expect(errors({ ...form, loose: "20" }, 15)).toMatchObject({ loose: "Enter 0 to 14" });
    expect(errors({ ...form, sellingPrice: "40" }, 15)).toMatchObject({ sellingPrice: "Selling price can't be more than MRP" });
  });
});
