import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { addDays, indiaDayStart, indiaIsoDate, lastMonthDays, salesPeriodRange, todayInIndia } from "@/lib/dates";
import { db } from "@/lib/db";
import type { ExpiryReportInput, ReportRangeInput, TopMedicinesInput } from "@/lib/validations";

// Every report covers the caller's shop only. Sales periods are Indian calendar days (lib/dates.ts).
// Money leaves as "123.45" strings.

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal | null | undefined) => (value ?? ZERO).toFixed(2);

/** The [start, end) instants and the first/last Indian day a report covers. */
export function resolveRange(input: ReportRangeInput, now: Date = new Date()) {
  const custom = input.period === "last-month" ? lastMonthDays(now) : { from: input.from, to: input.to };
  return salesPeriodRange(input.period === "last-month" ? "custom" : input.period, custom, now)!;
}

const saleWhere = (shopId: string, range: { start: Date; end: Date }): Prisma.SaleWhereInput => ({
  shopId,
  createdAt: { gte: range.start, lt: range.end },
});

// ---------------------------------------------------------------------------------------------
// Sales report

/** Sales in a period: totals, every day (zeros included), by payment method, and by GST rate with CGST/SGST. */
export async function salesReport(shopId: string, input: ReportRangeInput, now: Date = new Date()) {
  const range = resolveRange(input, now);
  const where = saleWhere(shopId, range);

  const [totals, daily, payments, gst] = await Promise.all([
    db.sale.aggregate({ where, _count: true, _sum: { subtotal: true, discount: true, taxTotal: true, total: true } }),
    db.$queryRaw<{ day: string; bills: number; discount: string; tax: string; total: string }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS bills,
             SUM("discount")::text AS discount,
             SUM("taxTotal")::text AS tax,
             SUM("total")::text AS total
      FROM "Sale"
      WHERE "shopId" = ${shopId} AND "createdAt" >= ${range.start} AND "createdAt" < ${range.end}
      GROUP BY 1
    `,
    db.sale.groupBy({ by: ["paymentMethod"], where, _count: true, _sum: { total: true } }),
    db.saleItem.groupBy({
      by: ["gstRate"],
      where: { sale: where },
      _sum: { lineTotal: true, discountAmount: true, taxAmount: true },
      orderBy: { gstRate: "asc" },
    }),
  ]);

  const byDay = new Map(daily.map((row) => [row.day, row]));
  const dayCount = Math.round((indiaDayStart(range.to).getTime() - indiaDayStart(range.from).getTime()) / DAY_MS) + 1;
  const days = Array.from({ length: dayCount }, (_, i) => {
    const day = indiaIsoDate(new Date(indiaDayStart(range.from).getTime() + i * DAY_MS));
    const row = byDay.get(day);
    return {
      day,
      bills: row ? Number(row.bills) : 0,
      discount: row ? new Prisma.Decimal(row.discount).toFixed(2) : "0.00",
      tax: row ? new Prisma.Decimal(row.tax).toFixed(2) : "0.00",
      amount: row ? new Prisma.Decimal(row.total).toFixed(2) : "0.00",
    };
  });

  const byPayment = (["CASH", "UPI", "CARD"] as const).map((method) => {
    const row = payments.find((p) => p.paymentMethod === method);
    return { method, bills: row?._count ?? 0, amount: money(row?._sum.total) };
  });

  // GST per rate. Within a state the GST is split equally into CGST and SGST; an odd paisa goes to CGST so the
  // two always add up to the GST exactly.
  let gstTaxable = ZERO;
  let gstTax = ZERO;
  let gstCgst = ZERO;
  const byGstRate = gst.map((row) => {
    const paid = (row._sum.lineTotal ?? ZERO).minus(row._sum.discountAmount ?? ZERO);
    const tax = row._sum.taxAmount ?? ZERO;
    const taxable = paid.minus(tax);
    const cgst = tax.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    gstTaxable = gstTaxable.plus(taxable);
    gstTax = gstTax.plus(tax);
    gstCgst = gstCgst.plus(cgst);
    return {
      rate: row.gstRate.toString(),
      taxable: money(taxable),
      tax: money(tax),
      cgst: money(cgst),
      sgst: money(tax.minus(cgst)),
      total: money(paid),
    };
  });

  return {
    range: { from: range.from, to: range.to },
    totals: {
      bills: totals._count,
      subtotal: money(totals._sum.subtotal),
      discount: money(totals._sum.discount),
      tax: money(totals._sum.taxTotal),
      amount: money(totals._sum.total),
    },
    days,
    byPayment,
    byGstRate,
    gstTotals: {
      taxable: money(gstTaxable),
      cgst: money(gstCgst),
      sgst: money(gstTax.minus(gstCgst)),
      tax: money(gstTax),
      total: money(gstTaxable.plus(gstTax)),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Top-selling medicines

/** Medicines ranked by net sales (after discount) or by units sold, in a period. */
export async function topMedicines(shopId: string, input: TopMedicinesInput, now: Date = new Date()) {
  const range = resolveRange(input.range, now);
  const rows = await db.saleItem.groupBy({
    by: ["medicineId"],
    where: { sale: saleWhere(shopId, range) },
    _sum: { lineTotal: true, discountAmount: true, unitsDeducted: true },
  });

  const medicines = await db.medicine.findMany({
    where: { id: { in: rows.map((r) => r.medicineId) }, shopId },
    select: { id: true, name: true, genericName: true, packSize: true, unitLabel: true, packLabel: true },
  });
  const byId = new Map(medicines.map((m) => [m.id, m]));

  const items = rows
    .map((row) => ({
      medicine: byId.get(row.medicineId)!,
      amount: (row._sum.lineTotal ?? ZERO).minus(row._sum.discountAmount ?? ZERO),
      units: row._sum.unitsDeducted ?? 0,
    }))
    .filter((row) => row.medicine)
    .sort((a, b) =>
      input.sortBy === "quantity"
        ? b.units - a.units || b.amount.comparedTo(a.amount)
        : b.amount.comparedTo(a.amount) || b.units - a.units,
    );

  const totalAmount = items.reduce((sum, row) => sum.plus(row.amount), ZERO);
  return {
    range: { from: range.from, to: range.to },
    totalAmount: money(totalAmount),
    medicineCount: items.length,
    items: items.slice(0, input.limit).map((row, index) => ({
      rank: index + 1,
      ...row.medicine,
      units: row.units,
      amount: money(row.amount),
      // Share of all sales in the period, e.g. "12.4".
      share: totalAmount.isZero() ? "0.0" : row.amount.div(totalAmount).times(100).toFixed(1),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Stock report

/** Current stock per medicine with its value at purchase and selling price (prices are per pack). */
export async function stockReport(shopId: string) {
  const today = todayInIndia();
  const medicines = await db.medicine.findMany({
    where: { shopId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      genericName: true,
      isActive: true,
      packSize: true,
      unitLabel: true,
      packLabel: true,
      batches: {
        where: { quantity: { gt: 0 } },
        select: { quantity: true, expiryDate: true, purchasePrice: true, sellingPrice: true },
      },
    },
  });

  let totalPurchase = ZERO;
  let totalSelling = ZERO;
  let totalExpired = ZERO;

  const items = medicines
    .map((medicine) => {
      let sellableUnits = 0;
      let expiredUnits = 0;
      let purchaseValue = ZERO;
      let sellingValue = ZERO;
      let expiredValue = ZERO;
      for (const batch of medicine.batches) {
        // Per-pack price × units ÷ units per pack.
        const atPurchase = batch.purchasePrice.times(batch.quantity).div(medicine.packSize);
        if (batch.expiryDate < today) {
          expiredUnits += batch.quantity;
          expiredValue = expiredValue.plus(atPurchase);
        } else {
          sellableUnits += batch.quantity;
          purchaseValue = purchaseValue.plus(atPurchase);
          sellingValue = sellingValue.plus(batch.sellingPrice.times(batch.quantity).div(medicine.packSize));
        }
      }
      totalPurchase = totalPurchase.plus(purchaseValue);
      totalSelling = totalSelling.plus(sellingValue);
      totalExpired = totalExpired.plus(expiredValue);
      return {
        id: medicine.id,
        name: medicine.name,
        genericName: medicine.genericName,
        isActive: medicine.isActive,
        packSize: medicine.packSize,
        unitLabel: medicine.unitLabel,
        packLabel: medicine.packLabel,
        sellableUnits,
        expiredUnits,
        purchaseValue: money(purchaseValue),
        sellingValue: money(sellingValue),
        expiredValue: money(expiredValue),
      };
    })
    // Every active medicine (zero stock shows as zero); inactive ones only while stock is still on the shelf.
    .filter((row) => row.isActive || row.sellableUnits > 0 || row.expiredUnits > 0);

  return {
    asOf: indiaIsoDate(),
    items,
    totals: {
      medicines: items.length,
      purchaseValue: money(totalPurchase),
      sellingValue: money(totalSelling),
      expiredValue: money(totalExpired),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Expiry report

/** Batches with stock that have expired or expire within `withinDays`, soonest first, with their value at risk. */
export async function expiryReport(shopId: string, input: ExpiryReportInput) {
  const today = todayInIndia();
  const limit = addDays(today, input.withinDays);
  const batches = await db.inventoryBatch.findMany({
    where: { medicine: { shopId }, quantity: { gt: 0 }, expiryDate: { lte: limit } },
    orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
    select: {
      id: true,
      batchNumber: true,
      expiryDate: true,
      quantity: true,
      purchasePrice: true,
      medicine: { select: { id: true, name: true, isActive: true, packSize: true, unitLabel: true, packLabel: true } },
    },
  });

  let expiredValue = ZERO;
  let expiringValue = ZERO;
  let expiredCount = 0;
  const items = batches.map((batch) => {
    const value = batch.purchasePrice.times(batch.quantity).div(batch.medicine.packSize);
    const daysLeft = Math.round((batch.expiryDate.getTime() - today.getTime()) / DAY_MS);
    const expired = daysLeft < 0;
    if (expired) {
      expiredValue = expiredValue.plus(value);
      expiredCount += 1;
    } else {
      expiringValue = expiringValue.plus(value);
    }
    return {
      id: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      daysLeft,
      expired,
      quantity: batch.quantity,
      value: money(value),
      medicine: batch.medicine,
    };
  });

  return {
    withinDays: input.withinDays,
    items,
    totals: {
      expiredBatches: expiredCount,
      expiredValue: money(expiredValue),
      expiringBatches: items.length - expiredCount,
      expiringValue: money(expiringValue),
      totalValue: money(expiredValue.plus(expiringValue)),
    },
  };
}
