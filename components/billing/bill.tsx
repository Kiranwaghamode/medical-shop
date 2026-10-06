import { formatExpiry, formatINR, formatPercent, plural } from "@/lib/format";
import type { getSale } from "@/services/sales.service";

export type BillSale = Awaited<ReturnType<typeof getSale>>;

const PAYMENT: Record<BillSale["paymentMethod"], string> = { CASH: "Cash", UPI: "UPI", CARD: "Card" };

const dateTime = (date: Date) =>
  date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The printed bill (A4 / A5 on a normal printer). Prices are GST-inclusive; GST is shown as included, per rate.
 * Phase 8 adds shop details from Settings and a narrow thermal-receipt layout.
 */
export function Bill({ sale }: { sale: BillSale }) {
  const { shop } = sale;
  const discountLabel =
    sale.discountType === "PERCENT" ? `Discount (${Number(sale.discountValue)}%)` : "Discount";

  return (
    <article className="mx-auto w-full max-w-3xl bg-white p-8 text-sm text-black print:max-w-none print:p-0">
      <header className="flex flex-col items-center gap-0.5 border-b border-black/20 pb-4 text-center">
        <h1 className="text-xl font-bold tracking-wide uppercase">{shop.name}</h1>
        {shop.address && <p className="whitespace-pre-line">{shop.address}</p>}
        {shop.phone && <p>Phone: {shop.phone}</p>}
        {shop.gstin && <p>GSTIN: {shop.gstin}</p>}
        <p className="mt-2 text-xs font-semibold tracking-widest uppercase">{shop.gstin ? "Tax Invoice" : "Bill of Sale"}</p>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-black/20 py-3">
        <Info label="Invoice No." value={sale.invoiceNumber} strong />
        <Info label="Date" value={dateTime(sale.createdAt)} />
        {sale.customerName && <Info label="Patient / Customer" value={sale.customerName} />}
        {sale.customerPhone && <Info label="Phone" value={sale.customerPhone} />}
        {sale.doctorName && <Info label="Doctor" value={sale.doctorName} />}
        <Info label="Payment" value={PAYMENT[sale.paymentMethod]} />
      </section>

      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b border-black/40 text-left text-xs uppercase">
            <th className="py-1.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 pr-2 font-semibold">Item</th>
            <th className="py-1.5 pr-2 font-semibold">Batch / Exp</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1.5 pr-2 text-right font-semibold">MRP</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Rate</th>
            <th className="py-1.5 pr-2 text-right font-semibold">GST</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => {
            const word = item.soldBy === "PACK" ? item.packLabel : item.unitLabel;
            return (
              <tr key={item.id} className="border-b border-black/10 align-top">
                <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
                <td className="py-1.5 pr-2 font-medium">{item.medicineName}</td>
                <td className="py-1.5 pr-2 text-xs">
                  {item.batchNumber}
                  <br />
                  {formatExpiry(item.expiryDate)}
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">
                  {item.quantity} {plural(word, item.quantity)}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(item.mrp)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatINR(item.unitPrice)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatPercent(item.gstRate)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatINR(item.lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="mt-4 flex flex-col-reverse justify-between gap-6 sm:flex-row print:flex-row">
        <table className="text-xs">
          <thead>
            <tr className="text-left">
              <th className="pr-4 font-semibold">GST rate</th>
              <th className="pr-4 text-right font-semibold">Taxable value</th>
              <th className="text-right font-semibold">GST (included)</th>
            </tr>
          </thead>
          <tbody>
            {sale.gstSummary.map((row) => (
              <tr key={row.rate}>
                <td className="pr-4">{formatPercent(row.rate)}</td>
                <td className="pr-4 text-right tabular-nums">{formatINR(row.taxable)}</td>
                <td className="text-right tabular-nums">{formatINR(row.tax)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto flex w-64 flex-col gap-1">
          <Total label="Subtotal" value={formatINR(sale.subtotal)} />
          {Number(sale.discount) > 0 && <Total label={discountLabel} value={`− ${formatINR(sale.discount)}`} />}
          <Total label="GST included" value={formatINR(sale.taxTotal)} />
          <div className="mt-1 flex justify-between border-t-2 border-black pt-1.5 text-base font-bold">
            <dt>TOTAL</dt>
            <dd className="tabular-nums">{formatINR(sale.total)}</dd>
          </div>
        </dl>
      </section>

      <footer className="mt-8 border-t border-black/20 pt-3 text-center text-xs">
        <p className="font-medium">Thank you! Get well soon.</p>
        <p className="mt-1 text-black/60">All prices are inclusive of GST. Please check medicines and expiry before leaving the counter.</p>
      </footer>
    </article>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-black/60">{label}:</span>
      <span className={strong ? "font-semibold" : undefined}>{value}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
