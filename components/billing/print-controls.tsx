"use client";

import { Printer } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Print button. With `autoPrint` (after completing a sale) the print dialog opens once, by itself. */
export function PrintControls({ autoPrint }: { autoPrint: boolean }) {
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
    <Button onClick={() => window.print()}>
      <Printer /> Print bill
    </Button>
  );
}
