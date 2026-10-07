import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatDateTime,
  formatDayRange,
  formatExpiry,
  formatINR,
  formatPacks,
  formatPercent,
  formatUnits,
  percentChange,
} from "@/lib/format";

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
    expect(formatUnits(3, "veterinary")).toBe("3 veterinaries");
    expect(formatUnits(3, "tray")).toBe("3 trays");
  });

  it("shows expiry as month and year without shifting the date", () => {
    expect(formatExpiry(new Date("2027-03-31T00:00:00Z"))).toBe("Mar 2027");
    expect(formatExpiry(new Date("2026-12-31T00:00:00Z"))).toBe("Dec 2026");
    expect(formatExpiry(new Date("2027-09-30T00:00:00Z"))).toBe("Sep 2027"); // not "Sept"
  });

  it("formats GST rates", () => {
    expect(formatPercent("5")).toBe("5%");
    expect(formatPercent("12.50")).toBe("12.5%");
  });
});

describe("dates for sales", () => {
  it("shows a sale's time in India", () => {
    // 11:00 UTC = 4:30 pm IST
    expect(formatDateTime(new Date("2026-10-06T11:00:00Z")).replace(/\s/g, " ")).toBe("6 Oct 2026, 4:30 pm");
  });

  it("labels day ranges compactly", () => {
    expect(formatDayRange("2026-10-06", "2026-10-06")).toBe("6 Oct 2026");
    expect(formatDayRange("2026-10-01", "2026-10-06")).toBe("1 – 6 Oct 2026");
    expect(formatDayRange("2026-09-28", "2026-10-06")).toBe("28 Sep – 6 Oct 2026");
    expect(formatDayRange("2026-12-28", "2027-01-03")).toBe("28 Dec 2026 – 3 Jan 2027");
  });
});

describe("percentChange", () => {
  it("shows a signed whole-number percentage", () => {
    expect(percentChange("112.00", "100.00")).toEqual({ label: "+12%", direction: "up" });
    expect(percentChange("75.00", "100.00")).toEqual({ label: "−25%", direction: "down" });
    expect(percentChange("100.40", "100.00")).toEqual({ label: "0%", direction: "flat" });
  });

  it("has no percentage when there was nothing before", () => {
    expect(percentChange("50.00", "0.00")).toEqual({ label: null, direction: "up" });
    expect(percentChange("0.00", "0.00")).toEqual({ label: null, direction: "flat" });
  });
});
