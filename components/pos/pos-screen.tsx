"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CartTable } from "@/components/pos/cart-table";
import { CheckoutPanel, type Customer, type PaymentMethod } from "@/components/pos/checkout-panel";
import { ProductSearch, type Product } from "@/components/pos/product-search";
import { addToCart, allocateCart, priceCart, removeItem, switchSoldBy, updateItem, type CartItem } from "@/lib/cart";
import { formatINR } from "@/lib/format";
import { PricingError, type Bill } from "@/lib/pricing";
import { useTRPC } from "@/lib/trpc-client";

type PosState = {
  items: CartItem[];
  // Product snapshots (batches, prices) from search, keyed by medicine id.
  products: Record<string, Product>;
  discountType: "PERCENT" | "AMOUNT";
  discountValue: string;
  paymentMethod: PaymentMethod;
  customer: Customer;
  // One-time ID for saving this exact bill: a double-click or retry can't create a second sale.
  // Renewed whenever the bill changes and after each completed sale.
  requestId: string;
};

// Works on plain-http LAN addresses too (crypto.randomUUID needs a secure context).
function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const emptyState = (): PosState => ({
  items: [],
  products: {},
  discountType: "PERCENT",
  discountValue: "",
  paymentMethod: "CASH",
  customer: { customerName: "", customerPhone: "", doctorName: "" },
  requestId: newRequestId(),
});

// The cart survives a refresh or an accidental navigation. Stock and prices are re-checked when the sale is saved.
const STORAGE_KEY = "medical-shop:pos-cart:v1";

function loadState(): PosState {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();
    const state = JSON.parse(saved) as PosState;
    // JSON turns dates into strings.
    for (const product of Object.values(state.products)) {
      for (const batch of product.batches) batch.expiryDate = new Date(batch.expiryDate);
    }
    return { ...emptyState(), ...state };
  } catch {
    return emptyState();
  }
}

/** The New Sale screen. Rendered on the client only (see app/(dashboard)/sales/new/page.tsx), so it can read localStorage. */
export function PosScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<PosState>(loadState);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or disabled: the cart still works, it just won't survive a refresh.
    }
  }, [state]);

  // F2 jumps to the search box from anywhere on the screen.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const products = useMemo(() => new Map(Object.entries(state.products)), [state.products]);
  const { allocations, shortages } = useMemo(() => allocateCart(state.items, products), [state.items, products]);
  const grossBill = useMemo(() => priceCart(allocations, products, null), [allocations, products]);

  const { bill, discountError } = useMemo((): { bill: Bill | null; discountError: string | null } => {
    try {
      return { bill: priceCart(allocations, products, { type: state.discountType, value: state.discountValue }), discountError: null };
    } catch (error) {
      if (!(error instanceof PricingError)) throw error;
      const message = error.message.startsWith("Invalid") ? "Enter a number like 10 or 12.50" : error.message;
      return { bill: null, discountError: message };
    }
  }, [allocations, products, state.discountType, state.discountValue]);

  // Any change to the bill gets a new request ID (an unchanged bill keeps it, so retries stay safe).
  const update = (changes: Partial<PosState> | ((s: PosState) => Partial<PosState>)) =>
    setState((s) => ({ ...s, ...(typeof changes === "function" ? changes(s) : changes), requestId: newRequestId() }));

  // Keep only the product snapshots still used by the cart.
  const withItems = (s: PosState, items: CartItem[]): Partial<PosState> => ({
    items,
    products: Object.fromEntries(Object.entries(s.products).filter(([id]) => items.some((i) => i.medicineId === id))),
  });

  function onAdd(product: Product) {
    // Re-adding refreshes the snapshot with the latest stock and prices from search.
    update((s) => ({ products: { ...s.products, [product.id]: product }, items: addToCart(s.items, product) }));
  }

  function onClear() {
    const previous = state;
    setState({ ...emptyState(), paymentMethod: state.paymentMethod });
    toast("Cart cleared", { action: { label: "Undo", onClick: () => setState(previous) } });
    searchRef.current?.focus();
  }

  // After a refused sale: reload stock and prices for what's in the cart, so the warnings show what to fix.
  async function refreshProducts() {
    const ids = Object.keys(state.products);
    if (ids.length === 0) return;
    const fresh = await queryClient.fetchQuery({ ...trpc.sales.getProducts.queryOptions({ ids }), staleTime: 0 });
    update({
      // A deactivated medicine has nothing sellable; its line then shows as short.
      products: Object.fromEntries(fresh.map(({ isActive, ...p }) => [p.id, isActive ? p : { ...p, batches: [], sellableStock: 0 }])),
    });
  }

  const complete = useMutation(
    trpc.sales.create.mutationOptions({
      onSuccess: async (sale) => {
        setState((s) => ({ ...emptyState(), paymentMethod: s.paymentMethod }));
        toast.success(`Sale saved — ${sale.invoiceNumber} · ${formatINR(sale.total)}`);
        await queryClient.invalidateQueries(trpc.inventory.pathFilter());
        router.push(`/sales/${sale.id}?print=1`);
      },
      onError: async (error) => {
        toast.error(error.message, { duration: 8000 });
        if (error.data?.code === "CONFLICT" || error.data?.code === "NOT_FOUND") await refreshProducts();
      },
    }),
  );

  const blockedReason =
    state.items.length === 0
      ? "Add medicines to start a bill."
      : shortages.length > 0
        ? "Some items don't have enough stock — reduce the quantity or change the batch."
        : discountError
          ? "Fix the discount to continue."
          : null;

  function onComplete() {
    if (blockedReason || complete.isPending) return;
    complete.mutate({
      clientRequestId: state.requestId,
      // What to sell only; the server reads prices and stock itself.
      items: state.items.map(({ key, medicineId, soldBy, quantity, batchId }) => ({ key, medicineId, soldBy, quantity, batchId })),
      discount: state.discountValue.trim() ? { type: state.discountType, value: state.discountValue } : null,
      paymentMethod: state.paymentMethod,
      ...state.customer,
    });
  }

  return (
    <div
      className="grid items-start gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      // Ctrl + Enter completes the sale from anywhere on the screen.
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          onComplete();
        }
      }}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <ProductSearch inputRef={searchRef} onAdd={onAdd} />
        <CartTable
          items={state.items}
          products={products}
          allocations={allocations}
          shortages={shortages}
          grossBill={grossBill}
          onQuantity={(key, quantity) => update((s) => ({ items: updateItem(s.items, key, { quantity }) }))}
          onSoldBy={(key) =>
            update((s) => ({
              items: s.items.map((i) => (i.key === key ? switchSoldBy(i, s.products[i.medicineId].packSize) : i)),
            }))
          }
          onBatch={(key, batchId) => update((s) => ({ items: updateItem(s.items, key, { batchId }) }))}
          onRemove={(key) => update((s) => withItems(s, removeItem(s.items, key)))}
        />
      </div>

      <CheckoutPanel
        customer={state.customer}
        onCustomer={(customer) => update({ customer })}
        discountType={state.discountType}
        discountValue={state.discountValue}
        onDiscountType={(discountType) => update({ discountType })}
        onDiscountValue={(discountValue) => update({ discountValue })}
        discountError={discountError}
        paymentMethod={state.paymentMethod}
        onPaymentMethod={(paymentMethod) => update({ paymentMethod })}
        bill={bill}
        grossBill={grossBill}
        itemCount={state.items.length}
        blockedReason={blockedReason}
        saving={complete.isPending}
        onComplete={onComplete}
        onClear={onClear}
      />
    </div>
  );
}
