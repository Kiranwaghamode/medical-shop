import {
  addBatchSchema,
  batchIdSchema,
  createMedicineSchema,
  inventoryListSchema,
  medicineIdSchema,
  setMedicineActiveSchema,
  updateBatchSchema,
  updateMedicineSchema,
} from "@/lib/validations";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as inventory from "@/services/inventory.service";

// Input is validated here; all rules live in the inventory service.
export const inventoryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(inventoryListSchema)
    .query(({ ctx, input }) => inventory.listMedicines(ctx.shopId, input)),

  getById: protectedProcedure
    .input(medicineIdSchema)
    .query(({ ctx, input }) => inventory.getMedicine(ctx.shopId, input.id)),

  create: protectedProcedure
    .input(createMedicineSchema)
    .mutation(({ ctx, input }) => inventory.createMedicine(ctx.shopId, input)),

  update: protectedProcedure
    .input(updateMedicineSchema)
    .mutation(({ ctx, input }) => inventory.updateMedicine(ctx.shopId, input.id, input.data)),

  setActive: protectedProcedure
    .input(setMedicineActiveSchema)
    .mutation(({ ctx, input }) => inventory.setMedicineActive(ctx.shopId, input.id, input.isActive)),

  delete: protectedProcedure
    .input(medicineIdSchema)
    .mutation(({ ctx, input }) => inventory.deleteMedicine(ctx.shopId, input.id)),

  addBatch: protectedProcedure
    .input(addBatchSchema)
    .mutation(({ ctx, input }) => inventory.addBatch(ctx.shopId, input.medicineId, input.data)),

  updateBatch: protectedProcedure
    .input(updateBatchSchema)
    .mutation(({ ctx, input }) => inventory.updateBatch(ctx.shopId, input.id, input.data)),

  deleteBatch: protectedProcedure
    .input(batchIdSchema)
    .mutation(({ ctx, input }) => inventory.deleteBatch(ctx.shopId, input.id)),
});
