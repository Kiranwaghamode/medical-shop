import { describe, expect, it } from "vitest";
import { batchFieldsSchema, medicineFieldsSchema } from "@/lib/validations";

const batch = {
  batchNumber: "dl26c11",
  expiryMonth: "2028-04",
  mrp: "33.60",
  purchasePrice: "24.50",
  sellingPrice: "32.00",
  quantity: 150,
};

const medicine = {
  name: "  Dolo 650 ",
  genericName: "",
  gstRate: "5",
  packSize: 15,
  unitLabel: "tablet",
  packLabel: "strip",
  minimumStock: 30,
};

const errorFor = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, field: string) =>
  result.error?.issues.find((issue) => issue.path.join(".") === field)?.message;

describe("batchFieldsSchema", () => {
  it("accepts a valid batch and upper-cases the batch number", () => {
    const parsed = batchFieldsSchema.parse(batch);
    expect(parsed.batchNumber).toBe("DL26C11");
  });

  it("rejects a selling price above MRP, on the sellingPrice field", () => {
    const result = batchFieldsSchema.safeParse({ ...batch, sellingPrice: "40.00" });
    expect(errorFor(result, "sellingPrice")).toBe("Selling price can't be more than MRP");
  });

  it("allows selling exactly at MRP", () => {
    expect(batchFieldsSchema.safeParse({ ...batch, sellingPrice: "33.60" }).success).toBe(true);
  });

  it.each(["33.605", "-1", "abc", "", "1e3"])("rejects the amount %j", (mrp) => {
    expect(batchFieldsSchema.safeParse({ ...batch, mrp, sellingPrice: "0" }).success).toBe(false);
  });

  it("requires a valid expiry month", () => {
    expect(errorFor(batchFieldsSchema.safeParse({ ...batch, expiryMonth: "2028-13" }), "expiryMonth")).toBe(
      "Choose the expiry month",
    );
  });

  it("rejects negative or fractional quantities", () => {
    expect(batchFieldsSchema.safeParse({ ...batch, quantity: -1 }).success).toBe(false);
    expect(batchFieldsSchema.safeParse({ ...batch, quantity: 1.5 }).success).toBe(false);
  });
});

describe("medicineFieldsSchema", () => {
  it("trims text and stores empty optional fields as null", () => {
    const parsed = medicineFieldsSchema.parse(medicine);
    expect(parsed.name).toBe("Dolo 650");
    expect(parsed.genericName).toBeNull();
    expect(parsed.barcode).toBeNull();
  });

  it("requires a name", () => {
    expect(errorFor(medicineFieldsSchema.safeParse({ ...medicine, name: "   " }), "name")).toBe("Name is required");
  });

  it("limits GST to 0–100%", () => {
    expect(medicineFieldsSchema.safeParse({ ...medicine, gstRate: "18" }).success).toBe(true);
    expect(medicineFieldsSchema.safeParse({ ...medicine, gstRate: "150" }).success).toBe(false);
  });

  it("requires a pack size of at least 1", () => {
    expect(medicineFieldsSchema.safeParse({ ...medicine, packSize: 0 }).success).toBe(false);
  });

  it("only allows letters, digits and dashes in barcodes", () => {
    expect(medicineFieldsSchema.safeParse({ ...medicine, barcode: "8901234500011" }).success).toBe(true);
    expect(medicineFieldsSchema.safeParse({ ...medicine, barcode: "89 01" }).success).toBe(false);
  });
});
