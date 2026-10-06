// POS cart logic, shared by the POS screen (preview) and the server (Phase 7 re-runs it against live stock).
// A cart item is "medicine + sold by pack/loose + quantity", taken either automatically from the batches that
// expire first (FEFO, splitting across batches when needed) or from one batch the user picked.
import { calculateBill, type Bill, type DiscountInput, type PriceLineInput, type SoldBy } from "@/lib/pricing";

export type CartItem = {
  key: string;
  medicineId: string;
  soldBy: SoldBy;
  // Packs when soldBy = PACK, single units when soldBy = UNIT.
  quantity: number;
  // null = automatic (earliest expiry first); otherwise only this batch is used.
  batchId: string | null;
};

export type StockBatch = {
  id: string;
  batchNumber: string;
  expiryDate: Date;
  // Units available.
  quantity: number;
  // Per pack.
  mrp: string;
  sellingPrice: string;
};

export type CartProduct = {
  id: string;
  name: string;
  gstRate: string;
  packSize: number;
  unitLabel: string;
  packLabel: string;
  // Sellable batches only, earliest expiry first.
  batches: StockBatch[];
};

export type Allocation = {
  itemKey: string;
  medicineId: string;
  batchId: string;
  soldBy: SoldBy;
  // In the item's units (packs or loose units) taken from this batch.
  quantity: number;
  unitsDeducted: number;
};

export type Shortage = {
  itemKey: string;
  // How many of the item's units (packs or loose units) could not be supplied.
  missing: number;
};

/**
 * Decides which batch each cart item comes from. Pinned items are served first (they can only use their batch),
 * then automatic items in cart order, each taking from the earliest-expiring batches. A pack must come whole from
 * one batch, so loose leftovers in a batch can't make up a pack. Stock used by one item isn't available to the next.
 */
export function allocateCart(items: CartItem[], products: Map<string, CartProduct>) {
  const remaining = new Map<string, number>();
  for (const product of products.values()) for (const batch of product.batches) remaining.set(batch.id, batch.quantity);

  const allocations: Allocation[] = [];
  const shortages: Shortage[] = [];
  const ordered = [...items.filter((i) => i.batchId), ...items.filter((i) => !i.batchId)];

  for (const item of ordered) {
    const product = products.get(item.medicineId);
    const perItem = item.soldBy === "PACK" ? (product?.packSize ?? 1) : 1;
    const candidates = (product?.batches ?? []).filter((b) => !item.batchId || b.id === item.batchId);
    let need = item.quantity;

    for (const batch of candidates) {
      if (need === 0) break;
      const left = remaining.get(batch.id) ?? 0;
      const take = Math.min(need, Math.floor(left / perItem));
      if (take === 0) continue;
      remaining.set(batch.id, left - take * perItem);
      need -= take;
      allocations.push({
        itemKey: item.key,
        medicineId: item.medicineId,
        batchId: batch.id,
        soldBy: item.soldBy,
        quantity: take,
        unitsDeducted: take * perItem,
      });
    }
    if (need > 0) shortages.push({ itemKey: item.key, missing: need });
  }

  // Back in cart order (pinned items were processed first).
  const position = new Map(items.map((item, index) => [item.key, index]));
  allocations.sort((a, b) => position.get(a.itemKey)! - position.get(b.itemKey)!);
  return { allocations, shortages };
}

/** Prices the allocated cart with the bill rules (lib/pricing.ts): one bill line per batch portion. */
export function priceCart(allocations: Allocation[], products: Map<string, CartProduct>, discount: DiscountInput): Bill {
  const lines: PriceLineInput[] = allocations.map((allocation) => {
    const product = products.get(allocation.medicineId)!;
    const batch = product.batches.find((b) => b.id === allocation.batchId)!;
    return {
      packSellingPrice: batch.sellingPrice,
      packMrp: batch.mrp,
      packSize: product.packSize,
      gstRate: product.gstRate,
      soldBy: allocation.soldBy,
      quantity: allocation.quantity,
    };
  });
  return calculateBill(lines, discount);
}

// ---------------------------------------------------------------------------------------------
// Cart edits (pure: return a new list)

let nextKey = 0;
const newKey = () => `item-${Date.now().toString(36)}-${(nextKey++).toString(36)}`;

/** Adds one of the product: increases an existing automatic line sold the same way, or adds a new line. */
export function addToCart(items: CartItem[], product: CartProduct, soldBy: SoldBy = "PACK"): CartItem[] {
  const existing = items.find((i) => i.medicineId === product.id && i.soldBy === soldBy && i.batchId === null);
  if (existing) return items.map((i) => (i === existing ? { ...i, quantity: i.quantity + 1 } : i));
  return [...items, { key: newKey(), medicineId: product.id, soldBy, quantity: 1, batchId: null }];
}

export function updateItem(items: CartItem[], key: string, changes: Partial<Omit<CartItem, "key" | "medicineId">>): CartItem[] {
  return items.map((i) => (i.key === key ? { ...i, ...changes } : i));
}

export function removeItem(items: CartItem[], key: string): CartItem[] {
  return items.filter((i) => i.key !== key);
}

/** Switches between packs and loose units, keeping the same amount where possible (2 strips ↔ 30 tablets). */
export function switchSoldBy(item: CartItem, packSize: number): CartItem {
  if (item.soldBy === "PACK") return { ...item, soldBy: "UNIT", quantity: item.quantity * packSize };
  return { ...item, soldBy: "PACK", quantity: Math.max(1, Math.floor(item.quantity / packSize)) };
}
