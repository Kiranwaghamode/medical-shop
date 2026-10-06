import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16 "proxy" (formerly middleware). It only makes the Clerk session readable on the server;
// it makes no access decisions. Access is checked where the protected things live:
//   - pages:  app/(dashboard)/layout.tsx  (signed in + ALLOWED_EMAILS)
//   - data:   tRPC protectedProcedure      (signed in + ALLOWED_EMAILS)
export default clerkMiddleware({ signInUrl: "/login", signUpUrl: "/login" });

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes (including tRPC).
    "/(api|trpc)(.*)",
  ],
};
