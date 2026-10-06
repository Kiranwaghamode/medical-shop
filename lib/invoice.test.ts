import { describe, expect, it } from "vitest";
import { financialYear, formatInvoiceNumber } from "@/lib/invoice";

describe("financialYear", () => {
  it("runs April to March", () => {
    expect(financialYear(new Date("2026-10-06T06:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-02-15T06:00:00Z"))).toBe("2026-27");
    expect(financialYear(new Date("2027-04-15T06:00:00Z"))).toBe("2027-28");
  });

  it("switches at midnight on 1 April in India, not UTC", () => {
    // 18:29 UTC on 31 Mar = 23:59 IST, still the old year.
    expect(financialYear(new Date("2027-03-31T18:29:59Z"))).toBe("2026-27");
    // 18:30 UTC on 31 Mar = 00:00 IST on 1 April, the new year.
    expect(financialYear(new Date("2027-03-31T18:30:00Z"))).toBe("2027-28");
  });

  it("formats the turn of the century", () => {
    expect(financialYear(new Date("2099-06-01T00:00:00Z"))).toBe("2099-00");
    expect(financialYear(new Date("2009-06-01T00:00:00Z"))).toBe("2009-10");
  });
});

describe("formatInvoiceNumber", () => {
  it("pads to six digits", () => {
    expect(formatInvoiceNumber("2026-27", 1)).toBe("INV-2026-27-000001");
    expect(formatInvoiceNumber("2026-27", 123456)).toBe("INV-2026-27-123456");
    expect(formatInvoiceNumber("2026-27", 1234567)).toBe("INV-2026-27-1234567");
  });
});
