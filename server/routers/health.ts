import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/trpc";

export const healthRouter = createTRPCRouter({
  // Checks the full path: browser → tRPC → Prisma → Neon.
  ping: publicProcedure
    .input(z.object({ message: z.string().trim().max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const started = Date.now();
      await ctx.db.$queryRaw`SELECT 1`;
      return {
        ok: true,
        echo: input?.message ?? "pong",
        database: "connected" as const,
        dbLatencyMs: Date.now() - started,
        serverTime: new Date(),
      };
    }),
});
