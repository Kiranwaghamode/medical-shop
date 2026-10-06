import { describe, expect, it } from "vitest";
import {
  addToCart,
  allocateCart,
  priceCart,
  removeItem,
  switchSoldBy,
  updateItem,
  type CartItem,
  type CartProduct,
} from "@/lib/cart";

const batch = (id: string, quantity: number, sellingPrice = "33.60", month = "01") => ({
  id,
  batchNumber: id.toUpperCase(),
  expiryDate: new Date(`2028-${month}-31T00:00:00Z`),
  quantity,
  mrp: "33.60",
  sellingPrice,
});

// Dolo: 15 tablets per strip. Batch A expires first: 20 strips + 7 loose. Batch B: 100 strips, cheaper.
const dolo: CartProduct = {
  id: "dolo",
  name: "Dolo 650",
  gstRate: "12",
  packSize: 15,
  unitLabel: "tablet",
  packLabel: "strip",
  batches: [batch("a", 307, "33.60", "01"), batch("b", 1500, "32.00", "03")],
};
const syrup: CartProduct = {
  id: "syrup",
  name: "Benadryl",
  gstRate: "5",
  packSize: 1,
  unitLabel: "bottle",
  packLabel: "bottle",
  batches: [batch("s", 3, "125.00")],
};
const products = new Map([dolo, syrup].map((p) => [p.id, p]));

const item = (key: string, overrides: Partial<CartItem> = {}): CartItem => ({
  key,
  medicineId: "dolo",
  soldBy: "PACK",
  quantity: 1,
  batchId: null,
  ...overrides,
});

const summary = (items: CartItem[]) => {
  const { allocations, shortages } = allocateCart(items, products);
  return {
    allocations: allocations.map((a) => `${a.itemKey}:${a.batchId}×${a.quantity}=${a.unitsDeducted}`),
    shortages: shortages.map((s) => `${s.itemKey}:-${s.missing}`),
  };
};

describe("allocateCart", () => {
  it("takes from the batch that expires first", () => {
    expect(summary([item("x", { quantity: 2 })])).toEqual({ allocations: ["x:a×2=30"], shortages: [] });
  });

  it("splits across batches when the first runs out — whole packs only", () => {
    // Batch A has 307 tablets = 20 strips + 7 loose; the 7 can't make a strip.
    expect(summary([item("x", { quantity: 25 })])).toEqual({ allocations: ["x:a×20=300", "x:b×5=75"], shortages: [] });
  });

  it("lets loose sales use the leftover tablets", () => {
    expect(summary([item("x", { quantity: 20 }), item("y", { soldBy: "UNIT", quantity: 10 })])).toEqual({
      allocations: ["x:a×20=300", "y:a×7=7", "y:b×3=3"],
      shortages: [],
    });
  });

  it("serves a pinned batch first, then automatic items from what is left", () => {
    expect(summary([item("auto", { quantity: 3 }), item("pin", { quantity: 19, batchId: "a" })])).toEqual({
      allocations: ["auto:a×1=15", "auto:b×2=30", "pin:a×19=285"],
      shortages: [],
    });
  });

  it("never takes a pinned item from another batch", () => {
    expect(summary([item("pin", { quantity: 21, batchId: "a" })])).toEqual({ allocations: ["pin:a×20=300"], shortages: ["pin:-1"] });
  });

  it("reports what can't be supplied", () => {
    expect(summary([item("s", { medicineId: "syrup", quantity: 5 })])).toEqual({ allocations: ["s:s×3=3"], shortages: ["s:-2"] });
    expect(summary([item("ghost", { medicineId: "unknown" })])).toEqual({ allocations: [], shortages: ["ghost:-1"] });
  });

  it("returns allocations in cart order", () => {
    const { allocations } = allocateCart([item("first", { medicineId: "syrup" }), item("second", { batchId: "b" })], products);
    expect(allocations.map((a) => a.itemKey)).toEqual(["first", "second"]);
  });
});

describe("priceCart", () => {
  it("prices each batch portion at that batch's price", () => {
    const { allocations } = allocateCart([item("x", { quantity: 21 })], products); // 20 from A @33.60, 1 from B @32.00
    const bill = priceCart(allocations, products, null);
    expect(bill.lines.map((l) => `${l.quantity}×${l.unitPrice}=${l.lineTotal}`)).toEqual(["20×33.60=672.00", "1×32.00=32.00"]);
    expect(bill.total).toBe("704.00");
  });

  it("prices loose units and applies the bill discount", () => {
    const { allocations } = allocateCart([item("x", { soldBy: "UNIT", quantity: 5 })], products);
    const bill = priceCart(allocations, products, { type: "PERCENT", value: "10" });
    expect(bill).toMatchObject({ subtotal: "11.20", discount: "1.12", total: "10.08" });
  });
});

describe("cart edits", () => {
  it("adds a product, then increases the same automatic line", () => {
    const once = addToCart([], dolo);
    const twice = addToCart(once, dolo);
    expect(once).toHaveLength(1);
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ medicineId: "dolo", soldBy: "PACK", quantity: 2, batchId: null });
  });

  it("adds a separate line when sold differently or when the existing line is pinned", () => {
    const loose = addToCart(addToCart([], dolo), dolo, "UNIT");
    expect(loose.map((i) => i.soldBy)).toEqual(["PACK", "UNIT"]);
    const [first] = addToCart([], dolo);
    expect(addToCart([{ ...first, batchId: "a" }], dolo)).toHaveLength(2);
  });

  it("updates and removes items by key", () => {
    const items = addToCart(addToCart([], dolo), syrup);
    const updated = updateItem(items, items[0].key, { quantity: 4 });
    expect(updated[0].quantity).toBe(4);
    expect(removeItem(updated, items[0].key).map((i) => i.medicineId)).toEqual(["syrup"]);
  });

  it("switches between strips and tablets keeping the amount", () => {
    expect(switchSoldBy(item("x", { quantity: 2 }), 15)).toMatchObject({ soldBy: "UNIT", quantity: 30 });
    expect(switchSoldBy(item("x", { soldBy: "UNIT", quantity: 31 }), 15)).toMatchObject({ soldBy: "PACK", quantity: 2 });
    expect(switchSoldBy(item("x", { soldBy: "UNIT", quantity: 4 }), 15)).toMatchObject({ soldBy: "PACK", quantity: 1 });
  });
});
