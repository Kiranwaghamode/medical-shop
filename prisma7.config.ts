import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI (migrate, db push, studio) uses the direct, non-pooled Neon URL.
// The app itself connects through the pooled DATABASE_URL in lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
