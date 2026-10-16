import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Opt-in read-only live probe of the trade list against real Supabase PostgREST. Run by .github/workflows/trade-list-postgrest-probe.yml */
export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
      "server-only": path.resolve(__dirname, "tests/vitest-mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/posts/__tests__/trade-list-postgrest.live.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
