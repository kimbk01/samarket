import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Staging integration suite — runs only in the staging workflow against a disposable local Supabase. */
export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
      "server-only": path.resolve(__dirname, "tests/vitest-mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/community-operator-import/__tests__/*.staging.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
