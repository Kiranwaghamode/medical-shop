// Invoice counter against the real database, in temporary shops deleted afterwards. `npm run test:db`
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { nextInvoiceNumber } from "@/services/invoice.service";

let shopId: string;
let otherShopId: string;

beforeAll(async () => {
  shopId = (await db.shop.create({ data: { name: "TEST invoice shop" } })).id;
  otherShopId = (await db.shop.create({ data: { name: "TEST invoice other shop" } })).id;
});

afterAll(async () => {
  await db.invoiceCounter.deleteMany({ where: { shopId: { in: [shopId, otherShopId] } } });
  await db.shop.deleteMany({ where: { id: { in: [shopId, otherShopId] } } });
  await db.$disconnect();
});

const next = (shop: string, fy: string) => db.$transaction((tx) => nextInvoiceNumber(tx, shop, fy));

describe("nextInvoiceNumber", () => {
  it("starts at 1 and counts up", async () => {
    expect(await next(shopId, "2030-31")).toBe("INV-2030-31-000001");
    expect(await next(shopId, "2030-31")).toBe("INV-2030-31-000002");
  });

  it("keeps a separate sequence per financial year and per shop", async () => {
    expect(await next(shopId, "2031-32")).toBe("INV-2031-32-000001");
    expect(await next(otherShopId, "2030-31")).toBe("INV-2030-31-000001");
    expect(await next(shopId, "2030-31")).toBe("INV-2030-31-000003");
  });

  it("does not use up a number when the sale transaction fails", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await nextInvoiceNumber(tx, shopId, "2032-33");
        throw new Error("sale failed");
      }),
    ).rejects.toThrow("sale failed");
    expect(await next(shopId, "2032-33")).toBe("INV-2032-33-000001");
  });

  it("gives simultaneous sales unique, consecutive numbers — including the first sale of a year", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () =>
        db.$transaction((tx) => nextInvoiceNumber(tx, shopId, "2033-34"), { maxWait: 20_000, timeout: 30_000 }),
      ),
    );
    expect([...numbers].sort()).toEqual(Array.from({ length: 10 }, (_, i) => `INV-2033-34-${String(i + 1).padStart(6, "0")}`));
  });
});
