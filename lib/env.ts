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

  // Clerk (Google sign-in). pk_test_/sk_test_ in development, pk_live_/sk_live_ in production.
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_", "should start with pk_"),
  CLERK_SECRET_KEY: z.string().startsWith("sk_", "should start with sk_"),

  // Google accounts allowed to use the app, comma-separated. Everyone else sees "Access denied".
  ALLOWED_EMAILS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email("contains an invalid email address")).min(1, "needs at least one email")),
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
