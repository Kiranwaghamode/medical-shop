import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Access denied — Medical Shop" };

// Shown to signed-in Google accounts that are not in ALLOWED_EMAILS.
export default async function AccessDeniedPage() {
  const access = await getAccess();
  if (access.status === "signed-out") redirect("/login");
  if (access.status === "allowed") redirect("/");
  const { email } = access;

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>This Google account is not allowed to use Medical Shop.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {email ? (
            <p>
              Signed in as <span className="font-medium">{email}</span>. Ask the shop owner to add this
              email to the allowed list, or sign out and use a different Google account.
            </p>
          ) : (
            // Setup problem rather than an unknown user: the session token has no email claim.
            <p className="text-destructive">
              Your email could not be read from the session. The session token in the Clerk dashboard
              needs the claim {'{ "email": "{{user.primary_email_address}}" }'}.
            </p>
          )}
          <SignOutButton redirectUrl="/login">
            <Button variant="outline" className="self-start">
              Sign out
            </Button>
          </SignOutButton>
        </CardContent>
      </Card>
    </main>
  );
}
