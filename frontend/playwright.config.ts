import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "admin-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      testMatch: /admin\.spec\.ts/,
    },
    {
      name: "asesora-desktop",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/asesora.json" },
      testMatch: /asesora\.spec\.ts/,
    },
    {
      name: "responsive-mobile",
      use: { ...devices["Pixel 5"], storageState: "e2e/.auth/admin.json" },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
