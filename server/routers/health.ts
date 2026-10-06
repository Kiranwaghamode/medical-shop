import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";

export const healthRouter = createTRPCRouter({
  // Checks the full path: browser → tRPC → auth → Prisma → Neon.
  // Protected so anonymous visitors can't use it to hit the database.
  ping: protectedProcedure
    .input(z.object({ message: z.string().trim().max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const started = Date.now();
      await ctx.db.$queryRaw`SELECT 1`;
      return {
        ok: true,
        echo: input?.message ?? "pong",
        user: ctx.user.email,
        database: "connected" as const,
        dbLatencyMs: Date.now() - started,
        serverTime: new Date(),
      };
    }),
});
