import { CheckCircle2, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bill, PAGE_MARGIN, type PaperSize } from "@/components/billing/bill";
import { PrintControls } from "@/components/billing/print-controls";
import { Button } from "@/components/ui/button";
import { requireAllowedUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { formatINR } from "@/lib/format";
import { getSale } from "@/services/sales.service";

export const metadata: Metadata = { title: "Bill" };

// A saved sale and its printable bill. Read on the server, scoped to the signed-in user's shop.
export default async function SalePage(props: PageProps<"/sales/[id]">) {
  const [{ id }, searchParams, user] = await Promise.all([props.params, props.searchParams, requireAllowedUser()]);

  const sale = await getSale(user.shopId, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });

  // ?paper=A4|A5 changes the paper for this print only; otherwise the shop's default from Settings.
  const paperSize: PaperSize = searchParams.paper === "A4" || searchParams.paper === "A5" ? searchParams.paper : sale.shop.billPaperSize;

  return (
    <div className="flex flex-col gap-6 p-6 print:p-0">
      {/* Tells the browser's print dialog which paper to use. */}
      <style>{`@media print { @page { size: ${paperSize} portrait; margin: ${PAGE_MARGIN[paperSize]}; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4 print:hidden">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-6 text-emerald-600" />
          <div>
            <p className="font-medium">
              Sale saved — {sale.invoiceNumber} · {formatINR(sale.total)}
            </p>
            <p className="text-sm text-muted-foreground">Stock has been deducted. Print the bill for the customer.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Right after a sale (?print=1), if the shop prints automatically. */}
          <PrintControls autoPrint={searchParams.print === "1" && sale.shop.autoPrint} paperSize={paperSize} />
          <Button asChild variant="outline">
            <Link href="/sales/new">
              <ShoppingCart /> New sale
            </Link>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-muted/30 py-6 shadow-sm print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:py-0 print:shadow-none">
        <Bill sale={sale} paperSize={paperSize} />
      </div>
    </div>
  );
}
