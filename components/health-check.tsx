"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/lib/trpc-client";

// Temporary Phase 1 check that the tRPC → Prisma → Neon path works. Replaced by the dashboard later.
export function HealthCheck() {
  const trpc = useTRPC();
  const ping = useQuery(trpc.health.ping.queryOptions({ message: "hello from the browser" }));

  return (
    <div className="flex flex-col gap-3">
      {ping.isPending && <p className="text-muted-foreground">Checking connection…</p>}

      {ping.isError && (
        <p className="text-destructive">
          Connection failed: {ping.error.message}
        </p>
      )}

      {ping.data && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">tRPC</dt>
          <dd className="font-medium text-green-600">OK — {ping.data.echo}</dd>
          <dt className="text-muted-foreground">API user</dt>
          <dd className="font-medium text-green-600">{ping.data.user}</dd>
          <dt className="text-muted-foreground">Database</dt>
          <dd className="font-medium text-green-600">
            {ping.data.database} ({ping.data.dbLatencyMs} ms)
          </dd>
          <dt className="text-muted-foreground">Server time</dt>
          {/* serverTime arrives as a real Date thanks to superjson */}
          <dd>{ping.data.serverTime.toLocaleString("en-IN")}</dd>
        </dl>
      )}

      <Button
        variant="outline"
        className="self-start"
        onClick={() => ping.refetch()}
        disabled={ping.isFetching}
      >
        {ping.isFetching ? "Checking…" : "Check again"}
      </Button>
    </div>
  );
}
