import { describe, expect, it } from "vitest";
import { addDays, dateToExpiryMonth, expiryMonthToDate, todayInIndia } from "@/lib/dates";

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
