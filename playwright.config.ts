import { defineConfig } from "@playwright/test";

/** Next dev `allowedDevOrigins` 때문에 `localhost` 과 `127.0.0.1` 혼용 시 `/_next` 가 막힐 수 있음 — 기본은 localhost */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "off",
  },
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        timeout: 180_000,
        reuseExistingServer: true,
      },
});
