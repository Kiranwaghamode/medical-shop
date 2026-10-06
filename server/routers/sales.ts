import { productSearchSchema } from "@/lib/validations";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as sales from "@/services/sales.service";

// Input is validated here; all rules live in the sales service.
export const salesRouter = createTRPCRouter({
  searchProducts: protectedProcedure
    .input(productSearchSchema)
    .query(({ ctx, input }) => sales.searchProducts(ctx.shopId, input)),
});
