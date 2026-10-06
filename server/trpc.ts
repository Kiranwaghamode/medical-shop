import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z, ZodError } from "zod";
import { getAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { ensureUser } from "@/services/user.service";

// Per-request context: database + who is calling (same check as the pages, see lib/auth.ts).
// protectedProcedure adds the app user and their shopId.
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

// Signed in AND on the ALLOWED_EMAILS list. Every business procedure must use this, and every
// query it runs must be filtered by ctx.shopId.
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { access } = ctx;
  if (access.status === "signed-out") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
  }
  if (access.status === "denied") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This account is not allowed to use the app." });
  }
  const user = await ensureUser(access.userId, access.email);
  const result = await next({ ctx: { user, shopId: user.shopId } });

  // Expected business errors from services keep their code and friendly message.
  if (!result.ok && result.error.cause instanceof AppError) {
    const { code, message } = result.error.cause;
    throw new TRPCError({ code, message, cause: result.error.cause });
  }
  return result;
});
