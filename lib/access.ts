import { env } from "@/lib/env";

// The signed-in user's email comes from the Clerk session token (custom claim "email"),
// configured in Clerk dashboard → Sessions → Customize session token.
export function isEmailAllowed(email: unknown): boolean {
  return typeof email === "string" && env.ALLOWED_EMAILS.includes(email.trim().toLowerCase());
}
