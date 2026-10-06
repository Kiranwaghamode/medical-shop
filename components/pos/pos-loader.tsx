"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The POS keeps the cart in localStorage, so it renders in the browser only (no server render to mismatch).
export const PosLoader = dynamic(() => import("@/components/pos/pos-screen").then((m) => m.PosScreen), {
  ssr: false,
  loading: () => (
    <div className="grid items-start gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-11" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-[480px]" />
    </div>
  ),
});
