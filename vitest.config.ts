import { defaultExclude, defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
  test: {
    environment: "node",
    /**
     * Playwright 전용 스펙은 Vitest 수집 대상에서 제외한다.
     * - tests/e2e: test.describe 등 런타임 오류
     * - scripts 아래 .spec.cjs: Playwright test.setTimeout 등이 Vitest와 호환되지 않음
     */
    exclude: [...defaultExclude, "**/tests/e2e/**", "**/scripts/**/*.spec.cjs"],
  },
});
