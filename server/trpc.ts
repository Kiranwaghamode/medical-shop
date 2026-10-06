import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { getAccess } from "@/lib/auth";
import { db } from "@/lib/db";

// Per-request context: database + who is calling (same check as the pages, see lib/auth.ts).
// Phase 3 adds the user's shopId here.
export async function createTRPCContext(opts: { headers: Headers }) {
  return { db, headers: opts.headers, access: await getAccess() };
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

// No sign-in required. Use only for things that expose no shop data.
export const publicProcedure = t.procedure;

// Signed in AND on the ALLOWED_EMAILS list. Every business procedure must use this.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const { access } = ctx;
  if (access.status === "signed-out") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  }
  if (access.status === "denied") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This account is not allowed to use the app." });
  }
  return next({ ctx: { user: { id: access.userId, email: access.email } } });
});
