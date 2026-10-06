import { describe, expect, it } from "vitest";
import { formatAxisINR, formatLongDay, formatShortDay, formatWeekdayDay, niceTicks } from "@/lib/chart";

describe("niceTicks", () => {
  it("covers the maximum with round steps from zero", () => {
    expect(niceTicks(437)).toEqual([0, 200, 400, 600]);
    expect(niceTicks(976.07)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(33.6)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(1000)).toEqual([0, 250, 500, 750, 1000]);
    expect(niceTicks(123456)).toEqual([0, 50000, 100000, 150000]);
  });

  it("always ends at or above the maximum", () => {
    for (const max of [1, 7, 99.99, 250, 1234, 98765, 4_50_000]) {
      const ticks = niceTicks(max);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it("gives a plain axis when there is nothing to show", () => {
    expect(niceTicks(0)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("chart labels", () => {
  it("formats rupee axis labels compactly, Indian style", () => {
    expect(formatAxisINR(0)).toBe("₹0");
    expect(formatAxisINR(750)).toBe("₹750");
    expect(formatAxisINR(2500)).toBe("₹2.5K");
    expect(formatAxisINR(40000)).toBe("₹40K");
    expect(formatAxisINR(120000)).toBe("₹1.2L");
    expect(formatAxisINR(20000000)).toBe("₹2Cr");
  });

  it("formats days", () => {
    expect(formatShortDay("2026-10-06")).toBe("6 Oct");
    expect(formatWeekdayDay("2026-10-06")).toBe("Tue 6");
    expect(formatLongDay("2026-09-30")).toBe("Wed, 30 Sep 2026");
  });
});
