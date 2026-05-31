import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("fetchOwnerStoreOrderDetailDeduped contract", () => {
  it("parses JSON inside single-flight factory", () => {
    const src = readRepo("business/fetch-owner-store-order-detail.ts");
    expect(src).toContain("ownerStoreOrderDetailFlightKey");
    expect(src).toContain("runSingleFlight");
    expect(src).toMatch(/normalizeOwnerStoreOrderReviewDetail/);
    expect(src).not.toMatch(/runSingleFlight\([^)]+,\s*\(\)\s*=>\s*fetch/);
  });
});
