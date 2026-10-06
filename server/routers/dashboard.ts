import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as dashboard from "@/services/dashboard.service";

export const dashboardRouter = createTRPCRouter({
  getStats: protectedProcedure.query(({ ctx }) => dashboard.getDashboard(ctx.shopId)),

  // Sidebar badge on Inventory.
  alertCount: protectedProcedure.query(({ ctx }) => dashboard.getAlertCount(ctx.shopId)),
});
