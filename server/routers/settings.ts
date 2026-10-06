import { shopSettingsSchema } from "@/lib/validations";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc";
import * as settings from "@/services/settings.service";

export const settingsRouter = createTRPCRouter({
  get: protectedProcedure.query(({ ctx }) => settings.getSettings(ctx.shopId)),

  update: protectedProcedure
    .input(shopSettingsSchema)
    .mutation(({ ctx, input }) => settings.updateSettings(ctx.shopId, input)),
});
