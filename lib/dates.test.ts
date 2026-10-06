import { describe, expect, it } from "vitest";
import {
  addDays,
  dateToExpiryMonth,
  expiryMonthToDate,
  indiaDayStart,
  indiaIsoDate,
  lastMonthDays,
  salesPeriodRange,
  todayInIndia,
} from "@/lib/dates";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("todayInIndia", () => {
  it("uses the Indian calendar date, not UTC", () => {
    // 20:00 UTC on 6 Oct is 01:30 IST on 7 Oct.
    expect(todayInIndia(new Date("2026-10-06T20:00:00Z"))).toEqual(day("2026-10-07"));
    // 18:00 UTC on 6 Oct is 23:30 IST, still 6 Oct.
    expect(todayInIndia(new Date("2026-10-06T18:00:00Z"))).toEqual(day("2026-10-06"));
  });
});

describe("expiry months", () => {
  it("stores an expiry month as the last day of that month", () => {
    expect(expiryMonthToDate("2027-03")).toEqual(day("2027-03-31"));
    expect(expiryMonthToDate("2027-04")).toEqual(day("2027-04-30"));
    expect(expiryMonthToDate("2027-02")).toEqual(day("2027-02-28"));
    expect(expiryMonthToDate("2028-02")).toEqual(day("2028-02-29")); // leap year
    expect(expiryMonthToDate("2027-12")).toEqual(day("2027-12-31"));
  });

  it("converts a stored expiry date back to its month", () => {
    expect(dateToExpiryMonth(day("2027-03-31"))).toBe("2027-03");
  });

  it("adds days", () => {
    expect(addDays(day("2026-10-06"), 30)).toEqual(day("2026-11-05"));
  });
});

describe("Indian calendar days for timestamps", () => {
  it("starts a day at 00:00 IST, which is 18:30 UTC the day before", () => {
    expect(indiaDayStart("2026-10-06").toISOString()).toBe("2026-10-05T18:30:00.000Z");
  });

  it("reads the Indian date of an instant", () => {
    expect(indiaIsoDate(new Date("2026-10-05T18:29:59Z"))).toBe("2026-10-05"); // 23:59 IST
    expect(indiaIsoDate(new Date("2026-10-05T18:30:00Z"))).toBe("2026-10-06"); // 00:00 IST
  });
});

describe("salesPeriodRange", () => {
  // Tuesday 6 Oct 2026, 10:00 IST.
  const now = new Date("2026-10-06T04:30:00Z");
  const range = (period: Parameters<typeof salesPeriodRange>[0], custom = {}) => {
    const r = salesPeriodRange(period, custom, now);
    return r && { from: r.from, to: r.to, start: r.start.toISOString(), end: r.end.toISOString() };
  };

  it("today = the whole Indian day", () => {
    expect(range("today")).toEqual({
      from: "2026-10-06",
      to: "2026-10-06",
      start: "2026-10-05T18:30:00.000Z",
      end: "2026-10-06T18:30:00.000Z",
    });
  });

  it("this week runs from Monday", () => {
    expect(range("week")).toMatchObject({ from: "2026-10-05", to: "2026-10-06" });
    // On a Sunday the week started six days earlier.
    expect(salesPeriodRange("week", {}, new Date("2026-10-11T06:00:00Z"))).toMatchObject({ from: "2026-10-05", to: "2026-10-11" });
    // On a Monday it's just today.
    expect(salesPeriodRange("week", {}, new Date("2026-10-05T06:00:00Z"))).toMatchObject({ from: "2026-10-05", to: "2026-10-05" });
  });

  it("this month runs from the 1st", () => {
    expect(range("month")).toMatchObject({ from: "2026-10-01", to: "2026-10-06", start: "2026-09-30T18:30:00.000Z" });
  });

  it("custom includes both end days, across month and year ends", () => {
    expect(range("custom", { from: "2026-09-29", to: "2026-10-02" })).toEqual({
      from: "2026-09-29",
      to: "2026-10-02",
      start: "2026-09-28T18:30:00.000Z",
      end: "2026-10-02T18:30:00.000Z",
    });
    expect(range("custom", { from: "2026-12-31", to: "2026-12-31" })?.end).toBe("2026-12-31T18:30:00.000Z");
  });

  it("returns no range for all time", () => {
    expect(range("all")).toBeNull();
  });
});

describe("lastMonthDays", () => {
  it("gives the whole previous month, across year ends and short months", () => {
    expect(lastMonthDays(new Date("2026-10-06T06:00:00Z"))).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(lastMonthDays(new Date("2027-01-15T06:00:00Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(lastMonthDays(new Date("2028-03-01T06:00:00Z"))).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    // 00:10 IST on 1 Nov is still 31 Oct in UTC, but in India it's November, so last month is October.
    expect(lastMonthDays(new Date("2026-10-31T18:40:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
});
