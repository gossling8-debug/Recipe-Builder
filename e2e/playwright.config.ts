import { defineConfig, devices } from "@playwright/test";

/**
 * Click-through tests: the real app (an emulator build) against the Firebase emulators,
 * with stand-ins for Claude and Stripe. Start everything with e2e/run.sh.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts", // not *.test.ts, so the unit tests (vitest) don't pick these up
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // one emulator, one Stripe stand-in: run in order
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  outputDir: "../test-results",
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    baseURL: process.env.APP_URL || "http://localhost:4329/",
    trace: "off",
    screenshot: "only-on-failure",
  },
});
