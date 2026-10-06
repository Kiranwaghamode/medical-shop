import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    // ReportsView reads the tab and filters from the URL.
    <Suspense>
      <ReportsView />
    </Suspense>
  );
}
