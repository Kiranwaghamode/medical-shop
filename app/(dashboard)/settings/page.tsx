import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ComingSoon
      icon={Settings}
      title="Settings"
      phase="Phase 8 (bills need the shop details)"
      features={[
        "Shop name, address and phone",
        "GSTIN",
        "Invoice settings",
      ]}
    />
  );
}
