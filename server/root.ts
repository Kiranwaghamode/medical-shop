import { healthRouter } from "@/server/routers/health";
import { inventoryRouter } from "@/server/routers/inventory";
import { salesRouter } from "@/server/routers/sales";
import { createCallerFactory, createTRPCRouter } from "@/server/trpc";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  inventory: inventoryRouter,
  sales: salesRouter,
});

export type AppRouter = typeof appRouter;

// Server-side caller for calling procedures directly (e.g. from Server Components).
export const createCaller = createCallerFactory(appRouter);
