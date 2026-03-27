import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
const port = Number(new URL(baseURL).port || "3000");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 12_000
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run start -- -p ${port}`,
    port,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_ONBOARDING_DISABLE_REMOTE_SYNC: "1",
      NEXT_PUBLIC_E2E_MOCK_AUTH: "1"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
