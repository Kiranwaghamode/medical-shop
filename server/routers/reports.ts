import { z } from "zod";
import { expiryReportSchema, reportRangeSchema, topMedicinesSchema } from "@/lib/validations";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as reports from "@/services/reports.service";

export const reportsRouter = createTRPCRouter({
  sales: protectedProcedure.input(reportRangeSchema).query(({ ctx, input }) => reports.salesReport(ctx.shopId, input)),

  topMedicines: protectedProcedure
    .input(topMedicinesSchema)
    .query(({ ctx, input }) => reports.topMedicines(ctx.shopId, input)),

  stock: protectedProcedure.input(z.void()).query(({ ctx }) => reports.stockReport(ctx.shopId)),

  expiry: protectedProcedure.input(expiryReportSchema).query(({ ctx, input }) => reports.expiryReport(ctx.shopId, input)),
});
