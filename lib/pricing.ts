// Bill calculation shared by the POS screen (live preview) and the server (the only numbers that are saved).
// All money is handled as integer paise in BigInt — exact, no floating-point error — and returned as "33.60" strings.
// Rounding is half-up to the paisa. Prices are GST-inclusive (MRP style); GST is back-calculated per line.

export type SoldBy = "PACK" | "UNIT";
export type DiscountInput = { type: "PERCENT" | "AMOUNT"; value: string } | null;

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

// ---------------------------------------------------------------------------------------------
// Money and rate helpers

/** "33.6" → 3360n. Throws on anything that isn't a non-negative amount with at most 2 decimals. */
export function toPaise(amount: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new PricingError(`Invalid amount: "${amount}"`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** 3360n → "33.60" */
export function fromPaise(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const abs = paise < 0n ? -paise : paise;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

/** "12.5" (%) → 1250n basis points (hundredths of a percent). */
function toBasisPoints(rate: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(rate.trim());
  if (!match) throw new PricingError(`Invalid percentage: "${rate}"`);
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

/** round(a / b), half-up, for a ≥ 0 and b > 0. */
function divRound(a: bigint, b: bigint): bigint {
  return (2n * a + b) / (2n * b);
}

// ---------------------------------------------------------------------------------------------
// Lines

export type PriceLineInput = {
  // Per pack, GST-inclusive, as stored on the batch.
  packSellingPrice: string;
  packMrp: string;
  packSize: number;
  gstRate: string;
  soldBy: SoldBy;
  // In packs when soldBy = PACK, in single units when soldBy = UNIT.
  quantity: number;
};

/** Price for one item as sold: the pack price, or pack price ÷ pack size for a loose unit. */
export function unitPricePaise(line: Pick<PriceLineInput, "packSellingPrice" | "packSize" | "soldBy">): bigint {
  const pack = toPaise(line.packSellingPrice);
  return line.soldBy === "PACK" ? pack : divRound(pack, BigInt(line.packSize));
}

/** Stock units this line removes from the batch. */
export function unitsDeducted(line: Pick<PriceLineInput, "packSize" | "soldBy" | "quantity">): number {
  return line.soldBy === "PACK" ? line.quantity * line.packSize : line.quantity;
}

function checkLine(line: PriceLineInput) {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new PricingError("Quantity must be at least 1.");
  if (!Number.isInteger(line.packSize) || line.packSize < 1) throw new PricingError("Invalid pack size.");
  if (line.soldBy === "UNIT" && line.packSize === 1) throw new PricingError("This item can only be sold whole.");
  if (toPaise(line.packSellingPrice) > toPaise(line.packMrp)) throw new PricingError("Selling price is above MRP.");
}

// ---------------------------------------------------------------------------------------------
// Bill

export type PricedLine = {
  soldBy: SoldBy;
  quantity: number;
  unitsDeducted: number;
  // Per item as sold (pack or single unit).
  unitPrice: string;
  unitMrp: string;
  gstRate: string;
  // unitPrice × quantity, before discount.
  lineTotal: string;
  // This line's share of the bill discount.
  discount: string;
  // GST contained in (lineTotal − discount).
  taxAmount: string;
};

export type Bill = {
  lines: PricedLine[];
  subtotal: string;
  discount: string;
  taxTotal: string;
  total: string;
};

/**
 * Prices a cart. The bill discount is spread across lines in proportion to their value (largest-remainder,
 * so the shares add up exactly), and each line's GST is back-calculated from what is actually paid for it.
 */
export function calculateBill(lines: PriceLineInput[], discountInput: DiscountInput = null): Bill {
  lines.forEach(checkLine);

  const gross = lines.map((line) => unitPricePaise(line) * BigInt(line.quantity));
  const subtotal = gross.reduce((sum, value) => sum + value, 0n);

  const discount = discountPaise(subtotal, discountInput);
  const shares = allocate(discount, gross);

  // GST contained in what is actually paid for each line.
  const tax = lines.map((line, i) => {
    const rate = toBasisPoints(line.gstRate);
    return divRound((gross[i] - shares[i]) * rate, 10_000n + rate);
  });

  const priced = lines.map((line, i): PricedLine => {
    const unitMrp = line.soldBy === "PACK" ? toPaise(line.packMrp) : divRound(toPaise(line.packMrp), BigInt(line.packSize));
    return {
      soldBy: line.soldBy,
      quantity: line.quantity,
      unitsDeducted: unitsDeducted(line),
      unitPrice: fromPaise(unitPricePaise(line)),
      unitMrp: fromPaise(unitMrp),
      gstRate: line.gstRate,
      lineTotal: fromPaise(gross[i]),
      discount: fromPaise(shares[i]),
      taxAmount: fromPaise(tax[i]),
    };
  });

  const taxTotal = tax.reduce((sum, value) => sum + value, 0n);
  return {
    lines: priced,
    subtotal: fromPaise(subtotal),
    discount: fromPaise(discount),
    taxTotal: fromPaise(taxTotal),
    total: fromPaise(subtotal - discount),
  };
}

function discountPaise(subtotal: bigint, input: DiscountInput): bigint {
  if (!input || input.value.trim() === "") return 0n;
  if (input.type === "PERCENT") {
    const bp = toBasisPoints(input.value);
    if (bp > 10_000n) throw new PricingError("Discount can't be more than 100%.");
    return divRound(subtotal * bp, 10_000n);
  }
  const amount = toPaise(input.value);
  if (amount > subtotal) throw new PricingError("Discount can't be more than the bill total.");
  return amount;
}

/** Splits `total` across `weights` proportionally; the parts are whole paise and add up exactly to `total`. */
function allocate(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total === 0n || sum === 0n) return weights.map(() => 0n);

  const parts = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w, i) => ({ i, rem: (total * w) % sum }));
  let left = total - parts.reduce((a, b) => a + b, 0n);
  // Give the leftover paise to the largest remainders (earlier lines first on ties).
  remainders.sort((a, b) => (b.rem > a.rem ? 1 : b.rem < a.rem ? -1 : a.i - b.i));
  for (const { i } of remainders) {
    if (left === 0n) break;
    parts[i] += 1n;
    left -= 1n;
  }
  return parts;
}
