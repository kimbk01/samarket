import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseHomeShelfProductConfig } from "@/lib/stores/product/stores-home-shelf-product-config";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  applyPopularityWindowOverlayToBrowseFilter,
  type BrowseFilteredStoreRowsResult,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import {
  compareStoreDiscoveryRecommendedRows,
  type StoreDiscoveryRecommendedContext,
} from "@/lib/stores/store-discovery-recommended-ranking";
import { sortStoreDiscoveryBrowseRows } from "@/lib/stores/store-discovery-browse-sort";
import {
  resolvePopularityWindowDays,
  resolveStorePopularitySinceIso,
  buildStorePopularityWindowMeta,
} from "@/lib/stores/store-discovery-popular-store";
import { browseListCacheKey } from "@/lib/stores/stores-browse-response-cache";
import { buildStoreHomeFeedCacheKey } from "@/lib/stores/store-home-feed-server-cache";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { DeliveryDistancePolicy } from "@/lib/delivery/delivery-ops-settings";

function primaryRow(cfg: Record<string, unknown> | null) {
  return {
    scopeKey: "restaurant",
    primarySlug: "restaurant",
    subSlug: null,
    enabled: true,
    displayTitleKo: null,
    displayTitleEn: null,
    adEnabled: false as const,
    couponEnabled: false as const,
    maxInsertion: null,
    intervalEveryN: 8,
    presentationMode: "card_benefit_integrated" as const,
    scheduleStart: null,
    scheduleEnd: null,
    productConfig: cfg,
  };
}

function homeItem(
  partial: Partial<StoreHomeFeedItem> & { id: string; completedOrderCount30d?: number }
): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    nameKo: "s",
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: "open",
    rating: 4,
    reviewCount: 4,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "10분",
    prepMinutes: 10,
    rideMinutes: 10,
    etaLabel: "약 20분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: 10,
      estPrepLabel: "10분",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
    paymentMethodsLine: "",
    distanceKm: 1,
    featuredItems: partial.featuredItems ?? [{ productId: `p-${partial.id}`, name: "메뉴", price: 100, imageUrl: null }],
    platformPopularProducts: [],
    profileImageUrl: null,
    isFeatured: false,
    completedOrderCount30d: partial.completedOrderCount30d ?? 0,
    discoveryEligibilityRank: 0,
    firstListedAt: partial.firstListedAt ?? null,
    discoveryCampaign: partial.discoveryCampaign ?? null,
  };
}

function browseCtx(sort: StoresBrowseRequestContext["sort"]): Pick<
  StoresBrowseRequestContext,
  "district" | "sort" | "deliveryDistancePolicy" | "origin"
> {
  const policy: DeliveryDistancePolicy = {
    enabled: false,
    source: "straight",
    defaultMaxKm: null,
    overDistanceBehavior: "deprioritize",
  };
  return {
    district: null,
    sort,
    deliveryDistancePolicy: policy,
    origin: {
      source: "none",
      lat: null,
      lng: null,
      cacheGeoPart: "g:none",
      addressId: null,
      cacheAddressPart: "addr:none",
    },
  };
}

function emptyFilter(ids: string[]): BrowseFilteredStoreRowsResult {
  return {
    rows: ids.map((id) => ({
      id,
      store_name: id,
      slug: id,
      description: null,
      region: null,
      city: null,
      district: null,
      profile_image_url: null,
      is_open: true,
      rating_avg: 4,
      review_count: 1,
      delivery_available: true,
      pickup_available: true,
      visit_available: true,
      reservation_available: false,
      is_featured: false,
      lat: null,
      lng: null,
      business_hours_json: null,
      business_type: null,
      store_topics: null,
    })),
    distById: null,
    statusById: new Map(),
    distanceSortMs: 0,
  };
}

describe("A1–A17 popularityWindowDays", () => {
  it("A1 missing field resolves to 30", () => {
    expect(resolvePopularityWindowDays(undefined)).toBe(30);
    expect(resolvePopularityWindowDays(null)).toBe(30);
    expect(parseHomeShelfProductConfig({}).popularityWindowDays).toBeUndefined();
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: primaryRow({}),
      subRow: null,
    });
    expect(resolved.popularityWindowDays).toBe(30);
  });

  it("A2 HOME 7d overlay membership/order", () => {
    const stores = [
      homeItem({ id: "hot7", completedOrderCount30d: 0 }),
      homeItem({ id: "hot30", completedOrderCount30d: 9 }),
    ];
    const composition = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot2Food"],
      slotDataSources: { slot2Food: "popular_menu" },
      slotPopularityWindowDays: { slot2Food: 7 },
      popularityCountsByDays: {
        7: new Map([
          ["hot7", 5],
          ["hot30", 0],
        ]),
      },
    });
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["hot7"]);
  });

  it("A3 HOME 30d overlay", () => {
    const stores = [
      homeItem({ id: "a", completedOrderCount30d: 1 }),
      homeItem({ id: "b", completedOrderCount30d: 8 }),
    ];
    const composition = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot2Food"],
      slotDataSources: { slot2Food: "popular_menu" },
      slotPopularityWindowDays: { slot2Food: 30 },
      popularityCountsByDays: {
        30: new Map([
          ["a", 2],
          ["b", 9],
        ]),
      },
    });
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["b", "a"]);
  });

  it("A4 BROWSE primary window", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: primaryRow({ popularityWindowDays: 7 }),
      subRow: null,
    });
    expect(resolved.popularityWindowDays).toBe(7);
  });

  it("A5 secondary inherit when key missing", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: primaryRow({ popularityWindowDays: 90, defaultSort: "popular" }),
      subRow: {
        ...primaryRow({ defaultSort: "rating" }),
        scopeKey: "restaurant/korean",
        subSlug: "korean",
        productConfig: { defaultSort: "rating" },
      },
    });
    expect(resolved.defaultSort).toBe("popular");
    expect(resolved.popularityWindowDays).toBe(90);
  });

  it("A6 secondary JSON cannot override window", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow: primaryRow({ popularityWindowDays: 30 }),
      subRow: {
        ...primaryRow({ popularityWindowDays: 7 }),
        scopeKey: "restaurant/korean",
        subSlug: "korean",
        productConfig: { popularityWindowDays: 7 },
      },
    });
    expect(resolved.popularityWindowDays).toBe(30);
  });

  it("A7 explicit sort popular still uses scope window field (no URL window)", () => {
    expect(resolvePopularityWindowDays(7)).toBe(7);
    const src = readFileSync(join(process.cwd(), "app/api/stores/browse/route.ts"), "utf8");
    expect(src).not.toContain("searchParams.get(\"window\"");
    expect(src).not.toContain("popularityWindowDays=");
  });

  it("A8 default comparator only order-count axis changes", () => {
    const rows = [
      { id: "a", slug: "a", district: null, rating_avg: 5, review_count: 10 },
      { id: "b", slug: "b", district: null, rating_avg: 5, review_count: 10 },
    ];
    const base: StoreDiscoveryRecommendedContext = {
      district: null,
      eligibilityRankById: new Map([
        ["a", 0],
        ["b", 0],
      ]),
      distanceKmById: new Map([
        ["a", 1],
        ["b", 1],
      ]),
      outOfRangeById: new Map([
        ["a", false],
        ["b", false],
      ]),
      hasGeo: true,
      completedOrderCount30dById: new Map([
        ["a", 10],
        ["b", 1],
      ]),
      completedOrderCountStatus: "ok",
    };
    expect(compareStoreDiscoveryRecommendedRows(base, rows[0], rows[1])).toBeLessThan(0);
    const overlay = {
      ...base,
      completedOrderCount30dById: new Map([
        ["a", 1],
        ["b", 10],
      ]),
    };
    expect(compareStoreDiscoveryRecommendedRows(overlay, rows[0], rows[1])).toBeGreaterThan(0);
  });

  it("A9–A12 rating/reviews/fast/distance overlay is a no-op", () => {
    const filter = emptyFilter(["a", "b"]);
    const overlay = new Map([
      ["a", 99],
      ["b", 1],
    ]);
    for (const sort of ["rating", "reviews", "fast", "distance"] as const) {
      const next = applyPopularityWindowOverlayToBrowseFilter(browseCtx(sort), filter, overlay);
      expect(next.rows.map((r) => r.id)).toEqual(filter.rows.map((r) => r.id));
    }
  });

  it("A13 cache keys isolate windows", () => {
    const a = browseListCacheKey({
      primary: "restaurant",
      sub: "all",
      region: "",
      city: "",
      district: "",
      addressPart: "addr:none",
      geoPart: "",
      page: "1",
      limit: "20",
      sort: "popular",
      uiLang: "ko",
      popularityWindowDays: 7,
    });
    const b = browseListCacheKey({
      primary: "restaurant",
      sub: "all",
      region: "",
      city: "",
      district: "",
      addressPart: "addr:none",
      geoPart: "",
      page: "1",
      limit: "20",
      sort: "popular",
      uiLang: "ko",
      popularityWindowDays: 30,
    });
    expect(a).not.toBe(b);
    const h7 = buildStoreHomeFeedCacheKey({
      region: null,
      district: null,
      searchQ: null,
      userLat: null,
      userLng: null,
      popularityWindowDaysKey: "7",
    });
    const h30 = buildStoreHomeFeedCacheKey({
      region: null,
      district: null,
      searchQ: null,
      userLat: null,
      userLng: null,
      popularityWindowDaysKey: "30",
    });
    expect(h7).not.toBe(h30);
  });

  it("A14/A15 displayed range matches canonical UTC rolling resolver", () => {
    const now = new Date("2026-08-25T00:00:00.000Z");
    const meta7 = buildStorePopularityWindowMeta(7, now);
    expect(meta7.popularitySinceIso).toBe(resolveStorePopularitySinceIso(now, 7));
    expect(meta7.popularityUntilIso).toBe(now.toISOString());
    expect(new Date(meta7.popularitySinceIso).toISOString()).toBe("2026-08-18T00:00:00.000Z");
    const meta90 = buildStorePopularityWindowMeta(90, now);
    expect(new Date(meta90.popularitySinceIso).toISOString()).toBe("2026-05-27T00:00:00.000Z");
  });

  it("A16 overlay ranking can differ from 30d ledger field", () => {
    const stores = [
      homeItem({ id: "ledger", completedOrderCount30d: 100 }),
      homeItem({ id: "window", completedOrderCount30d: 0 }),
    ];
    const composition = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot2Food"],
      slotDataSources: { slot2Food: "popular_menu" },
      slotPopularityWindowDays: { slot2Food: 7 },
      popularityCountsByDays: {
        7: new Map([
          ["ledger", 0],
          ["window", 4],
        ]),
      },
    });
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["window"]);
  });

  it("A17 wave candidate SQL stays 30d ledger — no window parameter", () => {
    const src = readFileSync(
      join(process.cwd(), "supabase/migrations/20260823220000_stores_discovery_browse_sub_filter_contract.sql"),
      "utf8"
    );
    expect(src).toContain("completed_orders_30d");
    expect(src).not.toContain("popularityWindowDays");
    expect(src).not.toContain("p_window");
    const live = readFileSync(
      join(process.cwd(), "lib/stores/discovery/load-store-discovery-ranked-live.ts"),
      "utf8"
    );
    expect(live).not.toContain("loadStoreCompletedOrderCount30dMapWithStatus");
  });

  it("parse round-trips 7/30/90 and strips invalid", () => {
    expect(parseHomeShelfProductConfig({ popularityWindowDays: 7 }).popularityWindowDays).toBe(7);
    expect(parseHomeShelfProductConfig({ popularityWindowDays: 15 }).popularityWindowDays).toBeUndefined();
  });

  it("popular overlay reorders browse popular", () => {
    const filter = emptyFilter(["a", "b"]);
    const overlay = new Map([
      ["a", 1],
      ["b", 8],
    ]);
    const next = applyPopularityWindowOverlayToBrowseFilter(browseCtx("popular"), filter, overlay);
    expect(next.rows.map((r) => r.id)).toEqual(["b", "a"]);
    void sortStoreDiscoveryBrowseRows;
  });
});
