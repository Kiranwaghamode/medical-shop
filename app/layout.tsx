import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRPCReactProvider } from "@/lib/trpc-client";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Medical Shop", template: "%s — Medical Shop" },
  description: "Inventory, billing and sales for a medical shop",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Google is the only sign-in method; first-time Google users are signed up on the same /login page. */}
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/login"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          afterSignOutUrl="/login"
        >
          <TRPCReactProvider>
            <TooltipProvider>{children}</TooltipProvider>
            {/* Light only: the app has no dark mode yet, so don't follow the system theme. */}
            <Toaster theme="light" position="top-right" />
          </TRPCReactProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
