import { UserButton } from "@clerk/nextjs";
import { HealthCheck } from "@/components/health-check";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireAllowedUser } from "@/lib/auth";

// Temporary home page for Phases 1–2. Phase 4 replaces it with the dashboard.
export default async function Home() {
  const { email } = await requireAllowedUser();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Medical Shop — System Check</CardTitle>
          <CardDescription>Browser → tRPC → Prisma → Neon</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <HealthCheck />
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{email}</span>
            </span>
            <UserButton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
