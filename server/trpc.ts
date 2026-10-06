import "server-only";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";

// Per-request context. Phase 2 adds the signed-in Clerk user and their shopId here.
export async function createTRPCContext(opts: { headers: Headers }) {
  return { db, headers: opts.headers };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  // superjson keeps Date and Prisma Decimal values intact between server and client.
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

// Public for now. Phase 2 adds protectedProcedure (Clerk session + shop scoping),
// which every business procedure will use.
export const publicProcedure = t.procedure;
