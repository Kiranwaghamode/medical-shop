"use client";

import { Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import type { PaperSize } from "@/components/billing/bill";
import { Segmented } from "@/components/pos/segmented";
import { Button } from "@/components/ui/button";

/**
 * Paper switch (A5 / A4 for this print only) and Print button. With `autoPrint` (right after completing a sale)
 * the print dialog opens once, by itself.
 */
export function PrintControls({ autoPrint, paperSize }: { autoPrint: boolean; paperSize: PaperSize }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const printed = useRef(false);

  // Changes some URL parameters and keeps the rest (e.g. ?saved=1).
  const replaceParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (!autoPrint || printed.current) return;
    printed.current = true;
    // Drop ?print=1 so a refresh or Back doesn't print again; then let the bill paint before printing.
    replaceParams({ print: null });
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
    // Runs once per bill; replaceParams is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint]);

  return (
    <>
      <Segmented
        label="Paper size"
        value={paperSize}
        onChange={(paper) => replaceParams({ paper, print: null })}
        options={[
          { value: "A5", label: "A5" },
          { value: "A4", label: "A4" },
        ]}
      />
      <Button onClick={() => window.print()}>
        <Printer /> Print bill
      </Button>
    </>
  );
}
