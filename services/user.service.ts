import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const DEFAULT_SHOP_NAME = "My Medical Shop";

export type CurrentUser = { id: string; clerkId: string; email: string; shopId: string };

const select = { id: true, clerkId: true, email: true, shopId: true } as const;

/**
 * Returns the app user for a signed-in (and already allowed) Clerk user, creating it on first sign-in.
 * Everyone joins the single shared shop; the very first sign-in creates that shop.
 */
export async function ensureUser(clerkId: string, email: string): Promise<CurrentUser> {
  const existing = await db.user.findUnique({ where: { clerkId }, select });
  if (existing) {
    if (existing.email === email) return existing;
    return db.user.update({ where: { clerkId }, data: { email }, select });
  }

  const shopId = await getOrCreateSharedShopId();
  try {
    return await db.user.create({ data: { clerkId, email, shopId }, select });
  } catch (error) {
    // A parallel first request for the same user created it first: read that one.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.user.findUniqueOrThrow({ where: { clerkId }, select });
    }
    throw error;
  }
}

export async function getOrCreateSharedShopId(): Promise<string> {
  const shop = await db.shop.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (shop) return shop.id;

  // First sign-in ever: serialise shop creation so simultaneous requests can't create two shops.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('medical-shop:create-shop'))`;
    const created = await tx.shop.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (created) return created.id;
    return (await tx.shop.create({ data: { name: DEFAULT_SHOP_NAME }, select: { id: true } })).id;
  }, { maxWait: 10_000, timeout: 20_000 });
}
