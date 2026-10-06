import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { isEmailAllowed } from "@/lib/access";

export type Access =
  | { status: "signed-out" }
  | { status: "denied"; userId: string; email: string | undefined }
  | { status: "allowed"; userId: string; email: string };

// Who is making this request and may they use the app? Cached per request.
export const getAccess = cache(async (): Promise<Access> => {
  const { userId, sessionClaims } = await auth();
  if (!userId) return { status: "signed-out" };

  const email = sessionClaims?.email;
  if (!email || !isEmailAllowed(email)) return { status: "denied", userId, email };

  return { status: "allowed", userId, email };
});

// For pages and layouts: redirects anyone who may not use the app.
export async function requireAllowedUser() {
  const access = await getAccess();
  if (access.status === "signed-out") redirect("/login");
  if (access.status === "denied") redirect("/access-denied");
  return access;
}
