import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3040);

const browser = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1500, height: 900 },
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Every worker queries the one demo database through a pool of four connections; more workers only queue behind it.
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "read",
      use: browser,
      testIgnore: ["board.spec.ts", "shots.spec.ts"],
    },
    // Board moves write to the database, so they run once every read-only check has finished.
    {
      name: "board",
      use: browser,
      testMatch: "board.spec.ts",
      dependencies: ["read"],
    },
    { name: "shots", use: browser, testMatch: "shots.spec.ts" },
  ],
  webServer: {
    command: `bun x next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
