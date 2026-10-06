import { describe, expect, it } from "vitest";
import { splitIntoPacks, summarizeStock } from "@/lib/inventory-status";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const today = day("2026-10-06");
const active = { isActive: true, minimumStock: 0 };

describe("summarizeStock", () => {
  it("counts only non-expired batches as sellable", () => {
    const summary = summarizeStock(
      active,
      [
        { quantity: 5, expiryDate: day("2026-08-31") }, // expired
        { quantity: 20, expiryDate: day("2026-10-31") }, // expiring soon
        { quantity: 100, expiryDate: day("2028-04-30") },
      ],
      today,
    );
    expect(summary).toEqual({
      sellableStock: 120,
      expiredStock: 5,
      expiringSoonStock: 20,
      nearestExpiry: day("2026-10-31"),
      status: "IN_STOCK",
    });
  });

  it("treats a batch expiring today as still sellable, and yesterday as expired", () => {
    const summary = summarizeStock(
      active,
      [
        { quantity: 3, expiryDate: day("2026-10-06") },
        { quantity: 4, expiryDate: day("2026-10-05") },
      ],
      today,
    );
    expect(summary.sellableStock).toBe(3);
    expect(summary.expiredStock).toBe(4);
  });

  it("flags 'expiring soon' up to and including 30 days ahead", () => {
    const at30 = summarizeStock(active, [{ quantity: 1, expiryDate: day("2026-11-05") }], today);
    const at31 = summarizeStock(active, [{ quantity: 1, expiryDate: day("2026-11-06") }], today);
    expect(at30.expiringSoonStock).toBe(1);
    expect(at31.expiringSoonStock).toBe(0);
  });

  it("ignores empty batches for nearest expiry and warnings", () => {
    const summary = summarizeStock(
      active,
      [
        { quantity: 0, expiryDate: day("2026-10-10") },
        { quantity: 0, expiryDate: day("2026-01-31") },
        { quantity: 10, expiryDate: day("2027-06-30") },
      ],
      today,
    );
    expect(summary).toMatchObject({ nearestExpiry: day("2027-06-30"), expiringSoonStock: 0, expiredStock: 0 });
  });

  it("works out the status", () => {
    const batches = [{ quantity: 6, expiryDate: day("2027-12-31") }];
    expect(summarizeStock({ isActive: true, minimumStock: 20 }, batches, today).status).toBe("LOW_STOCK");
    expect(summarizeStock({ isActive: true, minimumStock: 6 }, batches, today).status).toBe("IN_STOCK");
    expect(summarizeStock({ isActive: true, minimumStock: 0 }, batches, today).status).toBe("IN_STOCK");
    expect(summarizeStock({ isActive: true, minimumStock: 20 }, [], today).status).toBe("OUT_OF_STOCK");
    // Only expired stock left = nothing to sell.
    expect(
      summarizeStock({ isActive: true, minimumStock: 0 }, [{ quantity: 9, expiryDate: day("2026-01-31") }], today).status,
    ).toBe("OUT_OF_STOCK");
    expect(summarizeStock({ isActive: false, minimumStock: 20 }, batches, today).status).toBe("INACTIVE");
  });
});

describe("splitIntoPacks", () => {
  it("splits units into whole packs and loose units", () => {
    expect(splitIntoPacks(125, 15)).toEqual({ packs: 8, loose: 5 });
    expect(splitIntoPacks(30, 15)).toEqual({ packs: 2, loose: 0 });
    expect(splitIntoPacks(7, 1)).toEqual({ packs: 7, loose: 0 });
  });
});
