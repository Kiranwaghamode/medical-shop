import { cn } from "cn";
import { formatExpiry, formatINR, formatPercent, plural } from "@/lib/format";
import type { getSale } from "@/services/sales.service";

export type BillSale = Awaited<ReturnType<typeof getSale>>;
export type PaperSize = "A4" | "A5";

// Print margins per paper size; the on-screen preview uses the same padding, so it looks like the printout.
export const PAGE_MARGIN: Record<PaperSize, string> = { A4: "10mm", A5: "7mm" };

const PAYMENT: Record<BillSale["paymentMethod"], string> = { CASH: "Cash", UPI: "UPI", CARD: "Card" };

const dateTime = (date: Date) =>
  date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The printed bill (A4 / A5 on a normal printer). Prices are GST-inclusive; GST is shown as included, per rate.
 * Shop details, Drug Licence No. and footer text come from Settings.
 */
export function Bill({ sale, paperSize }: { sale: BillSale; paperSize: PaperSize }) {
  const a5 = paperSize === "A5";
  const { shop } = sale;
  const discountLabel =
    sale.discountType === "PERCENT" ? `Discount (${Number(sale.discountValue)}%)` : "Discount";

  return (
    <article
      data-paper={paperSize}
      style={{ padding: PAGE_MARGIN[paperSize] }}
      className={cn(
        "mx-auto w-full bg-white text-black print:max-w-none print:p-0!",
        // Real paper width on screen; compact text on A5 so a typical bill fits on half a sheet.
        a5 ? "max-w-[148mm] text-[11px] leading-snug" : "max-w-[210mm] text-[13px]",
      )}
    >
      <header className="flex flex-col items-center gap-0.5 border-b border-black/20 pb-4 text-center in-data-[paper=A5]:pb-2">
        <h1 className={cn("font-bold tracking-wide uppercase", a5 ? "text-base" : "text-xl")}>{shop.name}</h1>
        {shop.address && <p className="whitespace-pre-line">{shop.address}</p>}
        {shop.phone && <p>Phone: {shop.phone}</p>}
        {(shop.gstin || shop.drugLicenseNumber) && (
          <p>
            {[shop.gstin && `GSTIN: ${shop.gstin}`, shop.drugLicenseNumber && `D.L. No.: ${shop.drugLicenseNumber}`]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        )}
        <p className="mt-2 text-xs font-semibold tracking-widest uppercase">{shop.gstin ? "Tax Invoice" : "Bill of Sale"}</p>
      </header>

      <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-black/20 py-3 in-data-[paper=A5]:py-2">
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
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 font-semibold">#</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 font-semibold">Item</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 font-semibold">Batch / Exp</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right font-semibold">MRP</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right font-semibold">Rate</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right font-semibold">GST</th>
            <th className="py-1.5 in-data-[paper=A5]:py-0.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, index) => {
            const word = item.soldBy === "PACK" ? item.packLabel : item.unitLabel;
            return (
              <tr key={item.id} className="border-b border-black/10 align-top">
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 tabular-nums">{index + 1}</td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 font-medium">{item.medicineName}</td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-xs in-data-[paper=A5]:text-[9px]">
                  {item.batchNumber}
                  <br />
                  {formatExpiry(item.expiryDate)}
                </td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right whitespace-nowrap tabular-nums">
                  {item.quantity} {plural(word, item.quantity)}
                </td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right tabular-nums">{formatINR(item.mrp)}</td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right tabular-nums">{formatINR(item.unitPrice)}</td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 pr-2 text-right tabular-nums">{formatPercent(item.gstRate)}</td>
                <td className="py-1.5 in-data-[paper=A5]:py-0.5 text-right tabular-nums">{formatINR(item.lineTotal)}</td>
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

        <dl className="ml-auto flex w-64 flex-col gap-1 in-data-[paper=A5]:w-52 in-data-[paper=A5]:gap-0.5">
          <Total label="Subtotal" value={formatINR(sale.subtotal)} />
          {Number(sale.discount) > 0 && <Total label={discountLabel} value={`− ${formatINR(sale.discount)}`} />}
          <Total label="GST included" value={formatINR(sale.taxTotal)} />
          <div className="mt-1 flex justify-between border-t-2 border-black pt-1.5 text-base font-bold">
            <dt>TOTAL</dt>
            <dd className="tabular-nums">{formatINR(sale.total)}</dd>
          </div>
        </dl>
      </section>

      <footer className="mt-8 in-data-[paper=A5]:mt-4 border-t border-black/20 pt-3 text-center text-xs">
        {shop.billFooter && <p className="mb-1 whitespace-pre-line">{shop.billFooter}</p>}
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
