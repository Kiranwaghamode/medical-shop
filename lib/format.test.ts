import { describe, expect, it } from "vitest";
import { formatCount, formatExpiry, formatINR, formatPacks, formatPercent, formatUnits } from "@/lib/format";

const strip15 = { packSize: 15, unitLabel: "tablet", packLabel: "strip" };
const sachet = { packSize: 1, unitLabel: "sachet", packLabel: "sachet" };

describe("format", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(formatINR("33.6")).toBe("₹33.60");
    expect(formatINR("123456.5")).toBe("₹1,23,456.50");
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("formats counts with Indian grouping", () => {
    expect(formatCount(1807)).toBe("1,807");
    expect(formatCount(123456)).toBe("1,23,456");
  });

  it("shows stock as packs plus loose units", () => {
    expect(formatPacks(1807, strip15)).toBe("120 strips + 7");
    expect(formatPacks(90, strip15)).toBe("6 strips");
    expect(formatPacks(15, strip15)).toBe("1 strip");
    expect(formatPacks(7, strip15)).toBe("7 tablets");
    expect(formatPacks(0, strip15)).toBe("0 strips");
    expect(formatPacks(35, sachet)).toBe("35 sachets");
    expect(formatPacks(1, sachet)).toBe("1 sachet");
  });

  it("shows units", () => {
    expect(formatUnits(1807, "tablet")).toBe("1,807 tablets");
    expect(formatUnits(1, "bottle")).toBe("1 bottle");
  });

  it("shows expiry as month and year without shifting the date", () => {
    expect(formatExpiry(new Date("2027-03-31T00:00:00Z"))).toBe("Mar 2027");
    expect(formatExpiry(new Date("2026-12-31T00:00:00Z"))).toBe("Dec 2026");
  });

  it("formats GST rates", () => {
    expect(formatPercent("5")).toBe("5%");
    expect(formatPercent("12.50")).toBe("12.5%");
  });
});
