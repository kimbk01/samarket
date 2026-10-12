import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Real Realtime probe only — never part of `npm test` (file suffix is .qa.ts). */
export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/vitest-mocks/server-only.ts"),
      "agora-rtc-sdk-ng": path.resolve(root, "tests/vitest-mocks/agora-rtc-sdk-ng.ts"),
    },
  },
  test: {
    root,
    environment: "node",
    include: ["scripts/qa/realtime-probe/**/*.qa.ts"],
    testTimeout: 120_000,
    hookTimeout: 90_000,
    fileParallelism: false,
  },
});
