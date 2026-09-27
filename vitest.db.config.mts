import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Integration tests for src/server/data/* against the local Supabase Postgres (`pnpm sb:start`).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Data modules import "server-only", which throws outside React Server Components.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    // Reads .env.local (Next's loader skips it when NODE_ENV=test).
    env: { DATABASE_URL: loadEnv("development", process.cwd(), "").DATABASE_URL },
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
