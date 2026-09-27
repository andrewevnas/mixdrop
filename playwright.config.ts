import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Same env as `pnpm dev` (.env.local), so specs can tell whether R2 is configured.
loadEnvConfig(process.cwd(), true);

// The 5 GB upload test (@big) only runs when asked for: `pnpm e2e:big`.
const wantsBig = process.argv.some((a) => a.includes("@big"));

export default defineConfig({
  testDir: "./e2e",
  // Parallel Chromium launches crash intermittently on Windows; tests also share one dev server.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  grepInvert: wantsBig ? undefined : /@big/,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
