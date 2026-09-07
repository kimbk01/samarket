import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatStoreCardOutOfRangeLabel } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import type { DeliverySearchStoreResult } from "@/lib/delivery/search/search-delivery";

const root = process.cwd();

describe("CUT11 home search result OOR parity", () => {
  it("server search DTO already carries distanceOutOfRange", () => {
    const sample: DeliverySearchStoreResult = {
      id: "s1",
      slug: "store-a",
      store_name: "Store A",
      description: null,
      profile_image_url: null,
      rating_avg: 4,
      review_count: 1,
      district: null,
      city: "City",
      region: null,
      distanceOutOfRange: true,
      maxDeliveryDistanceKm: 5,
      distanceKm: 8,
    };
    expect(sample.distanceOutOfRange).toBe(true);
    expect(
      formatStoreCardOutOfRangeLabel({
        distanceOutOfRange: sample.distanceOutOfRange === true,
        maxDeliveryDistanceKm: sample.maxDeliveryDistanceKm,
        labelWithMax: (km) => `${km}km 초과`,
        labelGeneric: "거리 초과",
      })
    ).toBe("5km 초과");
  });

  it("DeliverySearchResults renders OOR via CUT9 format helper (no client haversine)", () => {
    const src = readFileSync(
      join(root, "components/delivery/search/DeliverySearchResults.tsx"),
      "utf8"
    );
    expect(src).toMatch(/formatStoreCardOutOfRangeLabel/);
    expect(src).toMatch(/distanceOutOfRange/);
    expect(src).not.toMatch(/haversine/i);
  });

  it("home search modal hook refreshes on addresses-updated", () => {
    const src = readFileSync(join(root, "hooks/use-delivery-store-search.ts"), "utf8");
    expect(src).toMatch(/SAMARKET_ADDRESSES_UPDATED_EVENT/);
    expect(src).toMatch(/runSearch\(debouncedQ\)/);
  });

  it("full search page also refreshes on addresses-updated (CUT11 parity)", () => {
    const src = readFileSync(
      join(root, "components/delivery/search/DeliverySearchPage.tsx"),
      "utf8"
    );
    expect(src).toMatch(/SAMARKET_ADDRESSES_UPDATED_EVENT/);
  });

  it("search-delivery keeps OOR stores but suppresses OOR menus (existing contract)", () => {
    const src = readFileSync(join(root, "lib/delivery/search/search-delivery.ts"), "utf8");
    expect(src).toMatch(/distanceOutOfRange: outOfRange/);
    expect(src).toMatch(/if \(meta\.out\) continue/);
  });
});
