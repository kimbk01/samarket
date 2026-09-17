import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortDiscoveryRowsByEligibilityThenDistance } from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";
import { storeHasCanonicalDeliveryOrigin } from "@/lib/stores/store-canonical-delivery-origin";
import { resolveListDistanceOutOfRange } from "@/lib/delivery/delivery-list-oor-policy";

describe("CUT 2 — discovery OOR / ranking parity", () => {
  it("sorts by eligibility rank then distance", () => {
    const ranks = new Map([
      ["a", 5],
      ["b", 0],
      ["c", 0],
    ]);
    const dist = new Map<string, number | null>([
      ["a", 1],
      ["b", 9],
      ["c", 3],
    ]);
    const sorted = sortDiscoveryRowsByEligibilityThenDistance(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      ranks,
      dist
    );
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("live loaders remap V2 OOR and pass memberLguId from HOME/Browse", () => {
    const live = readFileSync(
      join(process.cwd(), "lib/stores/discovery/load-store-discovery-ranked-live.ts"),
      "utf8"
    );
    const home = readFileSync(join(process.cwd(), "app/api/stores/home-feed/route.ts"), "utf8");
    const snap = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-snapshot.ts"),
      "utf8"
    );
    const browse = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-build.ts"),
      "utf8"
    );
    expect(live).toContain("resolveDiscoveryOorWithServiceAreaAuthority");
    expect(live).toContain("memberLguId");
    expect(home).toContain("memberLguId: origin.canonicalLguId");
    expect(snap).toContain("memberLguId: ctx.origin.canonicalLguId");
    expect(browse).toContain(
      "CUT 2 — display/status OOR always from dual-mode evaluator"
    );
    expect(browse).not.toMatch(
      /prefetchedFilter\?\.outOfRangeById\?\.has\(r\.id\) === true/
    );
  });

  it("ACTIVE STORE GEO — discovery remaps OOR for legacy and V2 (not V2-only)", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/stores/discovery/resolve-discovery-oor-with-service-area.ts"),
      "utf8"
    );
    expect(src).toContain("evaluateStoreDeliveryServiceArea");
    expect(src).not.toMatch(
      /if \(authorityMode === DELIVERY_SERVICE_AREA_AUTHORITY\.V2_LGU\) \{[\s\S]*evaluateStoreDeliveryServiceArea/
    );
    expect(src).toContain("missing coverage rows for");
  });

  it("missing_store_coords is member-list OOR and store origin helper rejects null", () => {
    expect(storeHasCanonicalDeliveryOrigin(null, null)).toBe(false);
    expect(storeHasCanonicalDeliveryOrigin(14.5, 121.0)).toBe(true);
    expect(
      resolveListDistanceOutOfRange({
        originSource: "saved_address",
        serviceabilityApplies: true,
        reason: "missing_store_coords",
      })
    ).toBe(true);
  });

  it("Owner/Admin delivery_available=true requires canonical geo", () => {
    const owner = readFileSync(
      join(process.cwd(), "app/api/me/stores/[storeId]/route.ts"),
      "utf8"
    );
    const admin = readFileSync(join(process.cwd(), "app/api/admin/stores/[id]/route.ts"), "utf8");
    expect(owner).toContain("STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR");
    expect(admin).toContain("STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR");
    expect(owner).toContain("storeHasCanonicalDeliveryOrigin");
    expect(admin).toContain("storeHasCanonicalDeliveryOrigin");
  });
});
