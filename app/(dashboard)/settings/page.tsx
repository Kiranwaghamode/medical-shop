import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";
import { requireAllowedUser } from "@/lib/auth";
import { getSettings } from "@/services/settings.service";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireAllowedUser();
  const settings = await getSettings(user.shopId);

  return (
    <div className="p-6">
      <SettingsForm initial={settings} email={user.email} />
    </div>
  );
}
