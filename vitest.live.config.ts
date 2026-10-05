import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Opt-in live probes against real public sites (read-only, no DB). Run by .github/workflows/community-import-live-probe.yml */
export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
      "server-only": path.resolve(__dirname, "tests/vitest-mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/community-operator-import/__tests__/*.live.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
