import { defineConfig } from "@playwright/test";

/**
 * Next dev `allowedDevOrigins` 때문에 `localhost` 과 `127.0.0.1` 혼용 시 `/_next` 가 막힐 수 있음 — 기본은 localhost.
 *
 * E2E: `E2E_SNAPSHOT_DIAG_ROOM_ID` — 거래 `summary` 있는 CM 방. `messenger-room-snapshot-diag-three-runs` 및
 * `messenger-composer-snapshot-three-stable`(composer 3회 안정 측정) 에서 동일하게 사용.
 * 값은 `scripts/apply-community-seed-and-trade-room.mjs` 실행 결과 JSON 의 `E2E_SNAPSHOT_DIAG_ROOM_ID` 를 참고.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  /** `npx playwright test ... --reporter=line` 와 동일하게 로컬에서 한 줄 요약 */
  reporter: [["line"]],
  use: {
    baseURL,
    trace: "off",
  },
  webServer: process.env.PLAYWRIGHT_NO_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        /** 첫 Turbopack/컴파일이 길 때 `webServer` 가 먼저 실패하지 않도록 */
        timeout: 240_000,
        reuseExistingServer: true,
      },
});
