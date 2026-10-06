import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // "@/..." imports, same as the app.
    tsconfigPaths: true,
    // Server modules import "server-only" (which throws outside Next's server). Tests run on the server side,
    // so use its no-op build.
    alias: { "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    projects: [
      {
        // Fast, no database: pure rules and calculations. `npm test`
        extends: true,
        test: { name: "unit", include: ["**/*.test.ts"], exclude: ["**/*.db.test.ts", "node_modules/**"] },
      },
      {
        // Against the real database, each test file in its own temporary shop. `npm run test:db`
        extends: true,
        test: {
          name: "db",
          include: ["**/*.db.test.ts"],
          exclude: ["node_modules/**"],
          setupFiles: ["dotenv/config"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          // Neon is remote: run files one after another to keep connections and noise low.
          fileParallelism: false,
        },
      },
    ],
  },
});
