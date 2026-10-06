import { createSaleSchema, productIdsSchema, productSearchSchema, saleIdSchema, salesListSchema } from "@/lib/validations";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as sales from "@/services/sales.service";

// Input is validated here; all rules live in the sales service.
export const salesRouter = createTRPCRouter({
  searchProducts: protectedProcedure
    .input(productSearchSchema)
    .query(({ ctx, input }) => sales.searchProducts(ctx.shopId, input)),

  // Fresh stock and prices for medicines already in the cart.
  getProducts: protectedProcedure
    .input(productIdsSchema)
    .query(({ ctx, input }) => sales.getProducts(ctx.shopId, input.ids)),

  // Completes a sale. The client sends what to sell; the server prices it and deducts stock.
  create: protectedProcedure
    .input(createSaleSchema)
    .mutation(({ ctx, input }) => sales.createSale(ctx.shopId, ctx.user.id, input)),

  // Sales history: filtered, paged, with totals.
  list: protectedProcedure
    .input(salesListSchema)
    .query(({ ctx, input }) => sales.listSales(ctx.shopId, input)),

  getById: protectedProcedure
    .input(saleIdSchema)
    .query(({ ctx, input }) => sales.getSale(ctx.shopId, input.id)),
});
