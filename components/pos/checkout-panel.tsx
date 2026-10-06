"use client";

import { Trash2 } from "lucide-react";
import { Segmented } from "@/components/pos/segmented";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatINR } from "@/lib/format";
import type { Bill } from "@/lib/pricing";

export type PaymentMethod = "CASH" | "UPI" | "CARD";
export type Customer = { customerName: string; customerPhone: string; doctorName: string };

export function CheckoutPanel({
  customer,
  onCustomer,
  discountType,
  discountValue,
  onDiscountType,
  onDiscountValue,
  discountError,
  paymentMethod,
  onPaymentMethod,
  bill,
  grossBill,
  itemCount,
  blockedReason,
  onClear,
}: {
  customer: Customer;
  onCustomer: (customer: Customer) => void;
  discountType: "PERCENT" | "AMOUNT";
  discountValue: string;
  onDiscountType: (type: "PERCENT" | "AMOUNT") => void;
  onDiscountValue: (value: string) => void;
  discountError: string | null;
  paymentMethod: PaymentMethod;
  onPaymentMethod: (method: PaymentMethod) => void;
  // Final bill (with discount), or null while the discount is invalid.
  bill: Bill | null;
  grossBill: Bill;
  itemCount: number;
  // Why the sale can't be completed yet, or null.
  blockedReason: string | null;
  onClear: () => void;
}) {
  const shown = bill ?? grossBill;

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Bill</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="customerName">Customer name</FieldLabel>
            <Input
              id="customerName"
              value={customer.customerName}
              onChange={(e) => onCustomer({ ...customer, customerName: e.target.value })}
              placeholder="Optional"
              maxLength={100}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="customerPhone">Phone</FieldLabel>
              <Input
                id="customerPhone"
                value={customer.customerPhone}
                onChange={(e) => onCustomer({ ...customer, customerPhone: e.target.value })}
                placeholder="Optional"
                inputMode="tel"
                maxLength={15}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="doctorName">Doctor</FieldLabel>
              <Input
                id="doctorName"
                value={customer.doctorName}
                onChange={(e) => onCustomer({ ...customer, doctorName: e.target.value })}
                placeholder="Optional"
                maxLength={100}
              />
            </Field>
          </div>
        </FieldGroup>

        <Field data-invalid={!!discountError}>
          <FieldLabel htmlFor="discountValue">Discount</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="discountValue"
              value={discountValue}
              onChange={(e) => onDiscountValue(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              aria-invalid={!!discountError}
              className="tabular-nums"
            />
            <Segmented
              label="Discount type"
              value={discountType}
              onChange={onDiscountType}
              options={[
                { value: "PERCENT", label: "%" },
                { value: "AMOUNT", label: "₹" },
              ]}
            />
          </div>
          {discountError && <FieldError>{discountError}</FieldError>}
        </Field>

        <Field>
          <FieldLabel>Payment</FieldLabel>
          <Segmented
            label="Payment method"
            value={paymentMethod}
            onChange={onPaymentMethod}
            options={[
              { value: "CASH", label: "Cash" },
              { value: "UPI", label: "UPI" },
              { value: "CARD", label: "Card" },
            ]}
          />
        </Field>

        <Separator />

        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label={`Subtotal (${itemCount} ${itemCount === 1 ? "item" : "items"})`} value={formatINR(shown.subtotal)} />
          <Row label="Discount" value={`− ${formatINR(bill?.discount ?? "0")}`} />
          <Row label="GST (included)" value={formatINR(shown.taxTotal)} muted />
          <Separator className="my-1" />
          <div className="flex items-baseline justify-between">
            <dt className="font-heading text-base font-semibold">Total</dt>
            <dd className="font-heading text-2xl font-semibold tabular-nums">{formatINR(shown.total)}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button size="lg" className="w-full" disabled title={blockedReason ?? undefined}>
          Complete sale
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {blockedReason ?? "Saving the sale and deducting stock arrives in Phase 7."}
        </p>
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear} disabled={itemCount === 0}>
          <Trash2 /> Clear cart
        </Button>
      </CardFooter>
    </Card>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={muted ? "text-muted-foreground" : undefined}>{label}</dt>
      <dd className={muted ? "text-muted-foreground tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}
