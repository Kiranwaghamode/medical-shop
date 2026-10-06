import { describe, expect, it } from "vitest";
import {
  calculateBill,
  fromPaise,
  PricingError,
  toPaise,
  unitPricePaise,
  unitsDeducted,
  type PriceLineInput,
} from "@/lib/pricing";

const dolo = (overrides: Partial<PriceLineInput> = {}): PriceLineInput => ({
  packSellingPrice: "33.60",
  packMrp: "33.60",
  packSize: 15,
  gstRate: "12",
  soldBy: "PACK",
  quantity: 1,
  ...overrides,
});

const sum = (values: string[]) => fromPaise(values.reduce((total, v) => total + toPaise(v), 0n));

describe("money helpers", () => {
  it("parses and formats rupees exactly", () => {
    expect(toPaise("33.6")).toBe(3360n);
    expect(toPaise("33.60")).toBe(3360n);
    expect(toPaise("0.05")).toBe(5n);
    expect(toPaise("1234567")).toBe(123456700n);
    expect(fromPaise(3360n)).toBe("33.60");
    expect(fromPaise(5n)).toBe("0.05");
    expect(fromPaise(0n)).toBe("0.00");
  });

  it.each(["-1", "1.234", "abc", "", "1e3", "0.1.2"])("rejects the amount %j", (value) => {
    expect(() => toPaise(value)).toThrow(PricingError);
  });
});

describe("price per item", () => {
  it("charges the exact pack price when sold by the pack", () => {
    expect(unitPricePaise(dolo())).toBe(3360n);
  });

  it("divides the pack price for loose units, rounding half-up to the paisa", () => {
    expect(unitPricePaise(dolo({ soldBy: "UNIT" }))).toBe(224n); // 33.60 / 15 = 2.24 exactly
    expect(unitPricePaise(dolo({ soldBy: "UNIT", packSellingPrice: "20.00" }))).toBe(133n); // 1.3333…
    expect(unitPricePaise(dolo({ soldBy: "UNIT", packSellingPrice: "10.00", packSize: 3 }))).toBe(333n); // 3.333…
    expect(unitPricePaise(dolo({ soldBy: "UNIT", packSellingPrice: "20.00", packSize: 3 }))).toBe(667n); // 6.666…
    expect(unitPricePaise(dolo({ soldBy: "UNIT", packSellingPrice: "0.05", packSize: 2 }))).toBe(3n); // 0.025 → 0.03
  });

  it("counts the stock units each line removes", () => {
    expect(unitsDeducted(dolo({ quantity: 2 }))).toBe(30);
    expect(unitsDeducted(dolo({ soldBy: "UNIT", quantity: 7 }))).toBe(7);
  });

  it("a full strip always costs exactly the pack price, even when loose prices round", () => {
    const strip = calculateBill([dolo({ packSellingPrice: "20.00", packMrp: "20.00" })]);
    const fifteenLoose = calculateBill([dolo({ packSellingPrice: "20.00", packMrp: "20.00", soldBy: "UNIT", quantity: 15 })]);
    expect(strip.total).toBe("20.00");
    expect(fifteenLoose.total).toBe("19.95"); // 15 × 1.33 — why "sell by strip" exists
  });
});

describe("calculateBill", () => {
  it("back-calculates GST from GST-inclusive prices", () => {
    const bill = calculateBill([dolo({ quantity: 2 })]);
    expect(bill).toEqual({
      lines: [
        {
          soldBy: "PACK",
          quantity: 2,
          unitsDeducted: 30,
          unitPrice: "33.60",
          unitMrp: "33.60",
          gstRate: "12",
          lineTotal: "67.20",
          discount: "0.00",
          taxAmount: "7.20", // 67.20 × 12 / 112
        },
      ],
      subtotal: "67.20",
      discount: "0.00",
      taxTotal: "7.20",
      total: "67.20",
    });
  });

  it("rounds GST per line and adds the lines up", () => {
    // 100 @ 5% contains 4.7619… → 4.76; 50 @ 18% contains 7.6271… → 7.63
    const bill = calculateBill([
      dolo({ packSellingPrice: "100.00", packMrp: "100.00", gstRate: "5" }),
      dolo({ packSellingPrice: "50.00", packMrp: "50.00", gstRate: "18" }),
    ]);
    expect(bill.lines.map((l) => l.taxAmount)).toEqual(["4.76", "7.63"]);
    expect(bill.taxTotal).toBe("12.39");
    expect(bill.total).toBe("150.00");
  });

  it("handles 0% GST and fractional rates", () => {
    const bill = calculateBill([
      dolo({ gstRate: "0" }),
      dolo({ packSellingPrice: "112.50", packMrp: "112.50", gstRate: "12.5" }),
    ]);
    expect(bill.lines.map((l) => l.taxAmount)).toEqual(["0.00", "12.50"]); // 112.50 × 12.5 / 112.5
  });

  it("shows the per-item MRP for loose units", () => {
    const [line] = calculateBill([dolo({ soldBy: "UNIT", quantity: 5 })]).lines;
    expect(line).toMatchObject({ unitPrice: "2.24", unitMrp: "2.24", lineTotal: "11.20", unitsDeducted: 5 });
  });

  it("returns zeros for an empty cart", () => {
    expect(calculateBill([])).toEqual({ lines: [], subtotal: "0.00", discount: "0.00", taxTotal: "0.00", total: "0.00" });
  });
});

describe("discount", () => {
  const cart = [
    dolo({ quantity: 2 }), // 67.20 @ 12%
    dolo({ packSellingPrice: "20.00", packMrp: "20.00", gstRate: "5", soldBy: "UNIT", quantity: 6 }), // 6 × 1.33 = 7.98 @ 5%
  ];

  it("applies a percentage discount to the whole bill", () => {
    const bill = calculateBill(cart, { type: "PERCENT", value: "10" });
    expect(bill.subtotal).toBe("75.18");
    expect(bill.discount).toBe("7.52"); // 7.518 → 7.52
    expect(bill.total).toBe("67.66");
  });

  it("spreads the discount across lines so the shares add up exactly", () => {
    const bill = calculateBill(cart, { type: "PERCENT", value: "10" });
    expect(bill.lines.map((l) => l.discount)).toEqual(["6.72", "0.80"]);
    expect(sum(bill.lines.map((l) => l.discount))).toBe(bill.discount);
  });

  it("gives leftover paise to the largest remainders when shares don't divide evenly", () => {
    const three = [dolo(), dolo(), dolo()]; // 3 × 33.60
    const bill = calculateBill(three, { type: "AMOUNT", value: "10.00" });
    expect(bill.lines.map((l) => l.discount)).toEqual(["3.34", "3.33", "3.33"]);
    expect(bill.total).toBe("90.80");
  });

  it("charges GST only on the discounted amount", () => {
    const bill = calculateBill([dolo({ packSellingPrice: "112.00", packMrp: "112.00" })], { type: "AMOUNT", value: "56.00" });
    expect(bill.lines[0].taxAmount).toBe("6.00"); // 56.00 × 12 / 112
    expect(bill.taxTotal).toBe("6.00");
    expect(bill.total).toBe("56.00");
  });

  it("accepts a rupee discount up to the full bill, and 100%", () => {
    expect(calculateBill(cart, { type: "AMOUNT", value: "75.18" })).toMatchObject({ total: "0.00", taxTotal: "0.00" });
    expect(calculateBill(cart, { type: "PERCENT", value: "100" })).toMatchObject({ total: "0.00" });
  });

  it("treats a blank discount as none", () => {
    expect(calculateBill(cart, { type: "AMOUNT", value: " " }).discount).toBe("0.00");
  });

  it("rejects discounts larger than the bill", () => {
    expect(() => calculateBill(cart, { type: "AMOUNT", value: "75.19" })).toThrow("Discount can't be more than the bill total.");
    expect(() => calculateBill(cart, { type: "PERCENT", value: "100.01" })).toThrow("Discount can't be more than 100%.");
    expect(() => calculateBill(cart, { type: "AMOUNT", value: "-5" })).toThrow(PricingError);
  });

  it("keeps every line's totals consistent with the database rules", () => {
    const bill = calculateBill(cart, { type: "PERCENT", value: "12.5" });
    for (const line of bill.lines) {
      expect(toPaise(line.lineTotal)).toBe(toPaise(line.unitPrice) * BigInt(line.quantity)); // SaleItem_lineTotal_check
      expect(toPaise(line.taxAmount)).toBeLessThanOrEqual(toPaise(line.lineTotal)); // SaleItem_taxAmount_le_line
      expect(toPaise(line.unitPrice)).toBeLessThanOrEqual(toPaise(line.unitMrp)); // SaleItem_unitPrice_le_mrp
    }
    expect(toPaise(bill.total)).toBe(toPaise(bill.subtotal) - toPaise(bill.discount)); // Sale_total_check
    expect(toPaise(bill.taxTotal)).toBeLessThanOrEqual(toPaise(bill.total)); // Sale_taxTotal_le_total
  });
});

describe("line checks", () => {
  it("rejects impossible lines", () => {
    expect(() => calculateBill([dolo({ quantity: 0 })])).toThrow("Quantity must be at least 1.");
    expect(() => calculateBill([dolo({ quantity: 1.5 })])).toThrow("Quantity must be at least 1.");
    expect(() => calculateBill([dolo({ packSize: 1, soldBy: "UNIT" })])).toThrow("This item can only be sold whole.");
    expect(() => calculateBill([dolo({ packSellingPrice: "40.00" })])).toThrow("Selling price is above MRP.");
  });
});
