import { HealthCheck } from "@/components/health-check";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Temporary home page for Phase 1. Phase 4 replaces it with the dashboard.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Medical Shop — System Check</CardTitle>
          <CardDescription>Browser → tRPC → Prisma → Neon</CardDescription>
        </CardHeader>
        <CardContent>
          <HealthCheck />
        </CardContent>
      </Card>
    </main>
  );
}
