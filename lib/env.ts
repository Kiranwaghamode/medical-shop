import "server-only";
import { z } from "zod";

const postgresUrl = z
  .url()
  .refine((url) => /^postgres(ql)?:\/\//.test(url), "must be a postgresql:// connection string");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Neon: pooled URL for the running app, direct URL for Prisma migrations.
  DATABASE_URL: postgresUrl.refine(
    (url) => url.includes("-pooler"),
    "should be Neon's POOLED connection string (host contains -pooler)",
  ),
  DIRECT_URL: postgresUrl.refine(
    (url) => !url.includes("-pooler"),
    "should be Neon's DIRECT connection string (host without -pooler)",
  ),

  // Clerk: optional until Phase 2 (authentication), then required.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .startsWith("pk_", "should start with pk_")
    .optional(),
  CLERK_SECRET_KEY: z.string().startsWith("sk_", "should start with sk_").optional(),
});

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  // Escape hatch for builds/CI that don't have real secrets (e.g. linting or Docker image builds).
  if (process.env.SKIP_ENV_VALIDATION === "true") return process.env as unknown as Env;

  // Treat empty values (e.g. `CLERK_SECRET_KEY=`) as missing.
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, process.env[key] || undefined]),
  );

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Lists variable names and problems only, never the values.
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables:\n${problems}\n\nCheck your .env file (see .env.example).`,
    );
  }
  return result.data;
}

export const env = loadEnv();
