import { CheckCircle2, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bill } from "@/components/billing/bill";
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

  return (
    <div className="flex flex-col gap-6 p-6 print:p-0">
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
        <div className="flex gap-2">
          <PrintControls autoPrint={searchParams.print === "1"} />
          <Button asChild variant="outline">
            <Link href="/sales/new">
              <ShoppingCart /> New sale
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <Bill sale={sale} />
      </div>
    </div>
  );
}
