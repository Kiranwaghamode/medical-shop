"use client";

import { Printer } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
  const printed = useRef(false);

  useEffect(() => {
    if (!autoPrint || printed.current) return;
    printed.current = true;
    // Drop ?print=1 so a refresh or Back doesn't print again; then let the bill paint before printing.
    router.replace(pathname, { scroll: false });
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [autoPrint, pathname, router]);

  return (
    <>
      <Segmented
        label="Paper size"
        value={paperSize}
        onChange={(paper) => router.replace(`${pathname}?paper=${paper}`, { scroll: false })}
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
