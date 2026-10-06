import "server-only";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { ShopSettingsInput } from "@/lib/validations";

const settingsSelect = {
  name: true,
  address: true,
  phone: true,
  gstin: true,
  drugLicenseNumber: true,
  billFooter: true,
  billPaperSize: true,
  autoPrint: true,
} as const;

export type ShopSettings = Awaited<ReturnType<typeof getSettings>>;

/** The shop's details and bill options (Settings page, bill header and footer). */
export async function getSettings(shopId: string) {
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: settingsSelect });
  if (!shop) throw new AppError("NOT_FOUND", "Shop not found.");
  return shop;
}

export async function updateSettings(shopId: string, input: ShopSettingsInput) {
  return db.shop.update({ where: { id: shopId }, data: input, select: settingsSelect });
}
