import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isNewStoreSignal } from "@/lib/stores/store-new-store-signal";
import { applyNewStoreShelfMembership } from "@/lib/stores/compose-browse-discovery-shelf-stores";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import {
  composeBrowseDiscoveryShelfPayload,
  insertDiscoveryShelfIntoOrganicIds,
  parseStoresBrowseDiscoveryShelfConfig,
  resolveBrowseShelfSourcePrimarySlugs,
  isBrowseShelfSelectedSourceValid,
} from "@/lib/stores/stores-browse-discovery-shelf";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  coerceBrowseSortToCustomerAvailability,
  parseStoresBrowseCustomerSortAvailability,
} from "@/lib/stores/stores-browse-customer-sort-availability";
import { sortStoreDiscoveryBrowseRows, type StoreDiscoverySortContext } from "@/lib/stores/store-discovery-browse-sort";
import { BROWSE_STORE_ROW_SELECTED_COLUMNS } from "@/lib/stores/stores-browse-build";

function shelfStores() {
  return [{ storeId: "x1", slug: "x1", name: "X", imageUrl: null, etaLabel: null, rating: 4 }];
}

function item(partial: Partial<BrowseStoreListItem> & { id: string }): BrowseStoreListItem {
  return {
    slug: partial.slug ?? partial.id,
    nameKo: partial.nameKo ?? partial.id,
    tagline: null,
    primarySlug: "restaurant",
    subSlug: "all",
    primaryNameKo: "식당",
    subNameKo: "전체",
    regionLabel: "",
    status: "open",
    rating: 4,
    reviewCount: 1,
    deliveryAvailable: true,
    pickupAvailable: true,
    visitAvailable: true,
    reservationAvailable: false,
    featuredItems: [],
    profileImageUrl: null,
    heroBannerImageUrl: null,
    isFeatured: false,
    firstListedAt: partial.firstListedAt ?? null,
    estPrepLabel: "",
    prepMinutes: null,
    rideMinutes: null,
    etaLabel: "",
    deliveryFeeLabel: "",
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    minOrderLabel: "",
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: null,
      estPrepLabel: "",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
    ...partial,
  };
}

function ctx(overrides: Partial<StoreDiscoverySortContext> = {}): StoreDiscoverySortContext {
  return {
    district: null,
    sort: "default",
    eligibilityRankById: new Map(),
    distanceKmById: new Map(),
    outOfRangeById: new Map(),
    hasGeo: true,
    completedOrderCount30dById: new Map(),
    completedOrderCountStatus: "ok",
    ...overrides,
  };
}

describe("stores browse final gap correction G1-G16", () => {
  it("G1 new_store shelf uses first_listed_at canonical signal", () => {
    const nowMs = Date.now();
    const listed = new Date(nowMs - 2 * 86400000).toISOString();
    const older = new Date(nowMs - 10 * 86400000).toISOString();
    expect(isNewStoreSignal({ firstListedAt: listed, nowMs })).toBe(true);
    const ranked = applyNewStoreShelfMembership([
      item({ id: "old", firstListedAt: older }),
      item({ id: "fresh", firstListedAt: listed }),
      item({ id: "legacy", firstListedAt: null }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(["fresh", "old"]);
  });

  it("G2 first_listed_at is on browse select but not organic ranking", () => {
    expect(BROWSE_STORE_ROW_SELECTED_COLUMNS).toContain("first_listed_at");
    const rankSrc = readFileSync(join(process.cwd(), "lib/stores/store-discovery-recommended-ranking.ts"), "utf8");
    expect(rankSrc).not.toMatch(/first_listed_at|firstListedAt/);
    const a = { id: "a", slug: "a", district: null, rating_avg: 5, review_count: 1 };
    const b = { id: "b", slug: "b", district: null, rating_avg: 4, review_count: 1 };
    const sorted = sortStoreDiscoveryBrowseRows(
      [a, b],
      ctx({
        sort: "default",
        eligibilityRankById: new Map([
          ["a", 0],
          ["b", 0],
        ]),
        rankingCriteria: ["rating", "distance"],
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("G3-G5 page_top / inline_after_n / page_end preserve organic ids", () => {
    const organics = ["A", "B", "C", "D"];
    const base = {
      enabled: true as const,
      afterN: 2,
      everyN: 6,
      maxShelvesPerPage: 2,
      dataType: "recommended" as const,
      stores: shelfStores(),
    };
    expect(insertDiscoveryShelfIntoOrganicIds(organics, { ...base, position: "page_top" }).filter((t) => t.kind === "organic").map((t) => t.kind === "organic" ? t.storeId : "")).toEqual(organics);
    expect(insertDiscoveryShelfIntoOrganicIds(organics, { ...base, position: "inline_after_n" }).map((t) => t.kind)).toEqual([
      "organic",
      "organic",
      "discovery_shelf",
      "organic",
      "organic",
    ]);
    expect(insertDiscoveryShelfIntoOrganicIds(organics, { ...base, position: "page_end" }).map((t) => t.kind)).toEqual([
      "organic",
      "organic",
      "organic",
      "organic",
      "discovery_shelf",
    ]);
  });

  it("G6-G8 repeat_every_n caps and preserves organic sequence", () => {
    const organics = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
    const tokens = insertDiscoveryShelfIntoOrganicIds(organics, {
      enabled: true,
      position: "repeat_every_n",
      afterN: 6,
      everyN: 6,
      maxShelvesPerPage: 2,
      dataType: "recommended",
      stores: shelfStores(),
    });
    expect(tokens.filter((t) => t.kind === "organic").map((t) => (t.kind === "organic" ? t.storeId : ""))).toEqual(organics);
    expect(tokens.filter((t) => t.kind === "discovery_shelf")).toHaveLength(2);
    expect(tokens.map((t) => (t.kind === "organic" ? t.storeId : "SHELF")).join("")).toBe(
      "ABCDEF" + "SHELF" + "GHIJKL" + "SHELF" + "MN"
    );
  });

  it("G9-G11 customer sort OFF hides those chips; default remains", () => {
    expect(coerceBrowseSortToCustomerAvailability("popular", { popular: false, rating: true, distance: true })).toBe(
      "default"
    );
    expect(coerceBrowseSortToCustomerAvailability("rating", { popular: true, rating: false, distance: true })).toBe(
      "default"
    );
    expect(coerceBrowseSortToCustomerAvailability("distance", { popular: true, rating: true, distance: false })).toBe(
      "default"
    );
    expect(coerceBrowseSortToCustomerAvailability("default", { popular: false, rating: false, distance: false })).toBe(
      "default"
    );
  });

  it("G12 admin default ranking is independent of customer chip OFF", () => {
    const rows = [
      { id: "near", slug: "near", district: null, rating_avg: 3, review_count: 1 },
      { id: "far-rated", slug: "far", district: null, rating_avg: 5, review_count: 1 },
    ];
    const ranks = new Map([
      ["near", 0],
      ["far-rated", 0],
    ]);
    const dist = new Map([
      ["near", 1],
      ["far-rated", 9],
    ]);
    const availability = parseStoresBrowseCustomerSortAvailability({ popular: false, rating: false, distance: false });
    expect(availability?.popular).toBe(false);
    const sorted = sortStoreDiscoveryBrowseRows(
      rows,
      ctx({
        sort: "default",
        eligibilityRankById: ranks,
        distanceKmById: dist,
        rankingCriteria: ["distance", "rating"],
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["near", "far-rated"]);
  });

  it("G13-G14 selected empty is invalid; runtime source is empty (no current-primary fallback)", () => {
    const cfg = parseStoresBrowseDiscoveryShelfConfig({
      enabled: true,
      exposurePrimarySlugs: ["restaurant"],
      sourceMode: "selected",
      sourcePrimarySlugs: [],
      dataType: "recommended",
      position: "page_top",
      maxItems: 6,
    });
    expect(cfg).not.toBeNull();
    expect(isBrowseShelfSelectedSourceValid(cfg!)).toBe(false);
    expect(
      resolveBrowseShelfSourcePrimarySlugs({
        config: cfg!,
        pagePrimarySlug: "restaurant",
        allPrimarySlugs: ["restaurant", "mart"],
      })
    ).toEqual([]);
    expect(
      composeBrowseDiscoveryShelfPayload({
        config: cfg!,
        pagePrimarySlug: "restaurant",
        stores: shelfStores(),
      })
    ).toBeNull();
    expect(
      composeBrowseDiscoveryShelfPayload({
        config: { ...cfg!, sourcePrimarySlugs: ["mart"] },
        pagePrimarySlug: "restaurant",
        stores: [],
      })
    ).toBeNull();
  });

  it("G15 exposure restaurant + source mart/cafe keeps source slugs independent", () => {
    const cfg = parseStoresBrowseDiscoveryShelfConfig({
      enabled: true,
      exposurePrimarySlugs: ["restaurant"],
      sourceMode: "selected",
      sourcePrimarySlugs: ["mart", "cafe"],
      dataType: "popular",
      position: "inline_after_n",
      afterN: 6,
      maxItems: 6,
    });
    expect(cfg?.exposurePrimarySlugs).toEqual(["restaurant"]);
    expect(
      resolveBrowseShelfSourcePrimarySlugs({
        config: cfg!,
        pagePrimarySlug: "restaurant",
        allPrimarySlugs: ["restaurant", "mart", "cafe"],
      })
    ).toEqual(["mart", "cafe"]);
  });

  it("G16 restaurant?korean inherits restaurant shelf + customer sort", () => {
    const primaryRow = {
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
      productConfig: {
        customerSortAvailability: { popular: false, rating: true, distance: true },
        browseShelf: {
          enabled: true,
          exposurePrimarySlugs: ["restaurant"],
          sourceMode: "selected",
          sourcePrimarySlugs: ["mart"],
          dataType: "new_store",
          position: "repeat_every_n",
          afterN: 6,
          everyN: 6,
          maxShelvesPerPage: 2,
          maxItems: 6,
        },
      },
    };
    const inherited = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow,
      subRow: null,
    });
    expect(inherited.customerSortAvailability.popular).toBe(false);
    expect(inherited.discoveryShelf.dataType).toBe("new_store");
    expect(inherited.discoveryShelf.sourcePrimarySlugs).toEqual(["mart"]);
    expect(inherited.discoveryShelf.position).toBe("repeat_every_n");
  });
});
