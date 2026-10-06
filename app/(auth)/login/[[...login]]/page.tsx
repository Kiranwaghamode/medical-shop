import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in — Medical Shop" };

// Catch-all route: Clerk uses sub-paths of /login (e.g. /login/sso-callback) during Google sign-in.
// Which sign-in methods appear is set in the Clerk dashboard — only Google is enabled.
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold">Medical Shop</h1>
        <p className="text-sm text-muted-foreground">Inventory, billing and sales</p>
      </div>
      <SignIn path="/login" routing="path" />
    </main>
  );
}
