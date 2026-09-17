import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("CUT 1 — store location writer / invalidation SSOT", () => {
  it("exports afterCanonicalStoreLocationWrite with required side effects", () => {
    const src = read("lib/stores/after-canonical-store-location-write.ts");
    expect(src).toContain("export function afterCanonicalStoreLocationWrite");
    expect(src).toContain("invalidateDiscoveryAfterStoreWrite");
    expect(src).toContain("clearStoreHomeFeedServerCache");
    expect(src).toContain("invalidateStorePublicCachesForSlugOnServer");
    expect(src).toContain("invalidateMeStoresListServerCache");
  });

  it("Owner / Admin / shop-linked writers all call the canonical post-write hook", () => {
    const owner = read("app/api/me/stores/[storeId]/route.ts");
    const admin = read("app/api/admin/stores/[id]/route.ts");
    const shop = read("lib/addresses/resolve-user-address-shop-write.ts");

    expect(owner).toContain("afterCanonicalStoreLocationWrite");
    expect(admin).toContain("afterCanonicalStoreLocationWrite");
    expect(shop).toContain("afterCanonicalStoreLocationWrite");

    // Shop sync must not rely on discovery-only invalidation without HOME clear
    expect(shop).not.toMatch(
      /invalidateDiscoveryStoreProjections\(sb,\s*sid,\s*\{\s*reasons:\s*\["store_geo"\]\s*\}\)/
    );
  });

  it("HOME feed skips process-local cache when distance axis is live-evaluated", () => {
    const home = read("app/api/stores/home-feed/route.ts");
    expect(home).toContain("distanceAxisEnabled ? null : getStoreHomeFeedCache");
  });
});
