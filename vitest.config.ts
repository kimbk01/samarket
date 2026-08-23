import { defaultExclude, defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
      "@domain/philife/api": path.resolve(__dirname, "lib/philife/api.ts"),
      "server-only": path.resolve(__dirname, "tests/vitest-mocks/server-only.ts"),
      /** Browser-only — Node vitest 전역 stub (samarket-ci-stability-regulation.mdc) */
      "agora-rtc-sdk-ng": path.resolve(__dirname, "tests/vitest-mocks/agora-rtc-sdk-ng.ts"),
    },
  },
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "tests/vitest-setup.node.ts")],
    /**
     * Per-test budget. Separately, Vitest worker↔main birpc defaults to 60s —
     * a single sync CPU block longer than that fails the whole run with
     * `[vitest-worker]: Timeout calling "onTaskUpdate"` even when tests pass.
     * Keep CI unit suites under that wall; scale benches stay outside vitest.
     */
    testTimeout: 15000,
    /**
     * Playwright 전용 스펙은 Vitest 수집 대상에서 제외한다.
     * - tests/e2e: test.describe 등 런타임 오류
     * - scripts 아래 .spec.cjs: Playwright test.setTimeout 등이 Vitest와 호환되지 않음
     */
    exclude: [
      ...defaultExclude,
      "**/tests/e2e/**",
      "**/scripts/**/*.spec.cjs",
      /** Node `node:test` only — run via `node --test scripts/__tests__/…` (see verify-ci-stability.mjs) */
      "**/scripts/__tests__/**",
      /** Local QA copies / nested worktrees must not be collected as duplicate suites. */
      "**/.qa-logs/**",
      "**/.worktrees/**",
    ],
  },
});
