"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format";
import { useTRPC } from "@/lib/trpc-client";

/** Shown only on paper: shop, report title, period, and when it was printed. */
export function PrintHeader({ title, period }: { title: string; period: string }) {
  const trpc = useTRPC();
  const settings = useQuery({ ...trpc.settings.get.queryOptions(), staleTime: 5 * 60_000 });

  return (
    <header className="hidden border-b border-black/30 pb-3 text-black print:block">
      <p className="text-lg font-bold uppercase">{settings.data?.name ?? "Medical Shop"}</p>
      {settings.data?.gstin && <p className="text-xs">GSTIN: {settings.data.gstin}</p>}
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="text-sm">{period}</p>
      </div>
      <p className="text-xs text-black/60">Printed {formatDateTime(new Date())}</p>
    </header>
  );
}
