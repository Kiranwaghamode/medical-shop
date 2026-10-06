import { describe, expect, it } from "vitest";
import { shopSettingsSchema } from "@/lib/validations";

const valid = {
  name: "  ABC Medical Store ",
  address: "MG Road\nBelagavi, Karnataka",
  phone: "0831-2401234, 98765 43210",
  gstin: "29abcde1234f1z5",
  drugLicenseNumber: "KA-BGM-20B-12345",
  billFooter: "Goods once sold will not be taken back.",
  billPaperSize: "A5" as const,
  autoPrint: true,
};

const errorFor = (input: Record<string, unknown>, field: string) =>
  shopSettingsSchema.safeParse(input).error?.issues.find((i) => i.path.join(".") === field)?.message;

describe("shopSettingsSchema", () => {
  it("accepts real shop details, trimming text and upper-casing the GSTIN", () => {
    expect(shopSettingsSchema.parse(valid)).toEqual({
      ...valid,
      name: "ABC Medical Store",
      gstin: "29ABCDE1234F1Z5",
    });
  });

  it("stores empty optional fields as null", () => {
    const parsed = shopSettingsSchema.parse({ ...valid, address: " ", phone: "", gstin: "", drugLicenseNumber: "", billFooter: "" });
    expect(parsed).toMatchObject({ address: null, phone: null, gstin: null, drugLicenseNumber: null, billFooter: null });
  });

  it("requires a shop name", () => {
    expect(errorFor({ ...valid, name: "  " }, "name")).toBe("Shop name is required");
  });

  it.each(["29ABCDE1234F1Z", "29ABCDE1234F1X5", "2XABCDE1234F1Z5", "29ABCDE1234F0Z5", "29 ABCDE1234F1Z5"])(
    "rejects the invalid GSTIN %s",
    (gstin) => {
      expect(errorFor({ ...valid, gstin }, "gstin")).toBe("Enter a valid 15-character GSTIN, e.g. 29ABCDE1234F1Z5");
    },
  );

  it("rejects letters in the phone number", () => {
    expect(errorFor({ ...valid, phone: "call me" }, "phone")).toBe("Use only digits, spaces, + - / and commas");
  });

  it("only allows A4 or A5 paper", () => {
    expect(shopSettingsSchema.safeParse({ ...valid, billPaperSize: "Letter" }).success).toBe(false);
  });
});
