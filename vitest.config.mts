import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
    // DB tests need local Supabase; run them with `pnpm test:db`.
    exclude: ["**/node_modules/**", "**/*.db.test.ts"],
  },
});
