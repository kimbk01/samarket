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
  parseStoresBrowseDiscoveryShelfPayload,
  resolveBrowseShelfSourcePrimarySlugs,
  isBrowseShelfSelectedSourceValid,
  stripDiscoveryShelfOrganicIds,
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

  function payload(position: "page_top" | "inline_after_n" | "page_end" | "repeat_every_n", extra: Partial<{ afterN: number; everyN: number; maxShelvesPerPage: number }> = {}) {
    return {
      enabled: true as const,
      position,
      afterN: extra.afterN ?? 2,
      everyN: extra.everyN ?? 2,
      maxShelvesPerPage: extra.maxShelvesPerPage ?? 2,
      dataType: "recommended" as const,
      stores: shelfStores(),
    };
  }

  it("S1-S7 canonical sequences preserve organic ids and keep shelf ids out of organic", () => {
    const organics = ["A", "B", "C", "D", "E", "F"];
    const top = insertDiscoveryShelfIntoOrganicIds(organics, payload("page_top"));
    expect(top.map((t) => (t.kind === "organic" ? t.storeId : "S"))).toEqual(["S", "A", "B", "C", "D", "E", "F"]);
    const inline = insertDiscoveryShelfIntoOrganicIds(organics, payload("inline_after_n", { afterN: 2 }));
    expect(inline.map((t) => (t.kind === "organic" ? t.storeId : "S"))).toEqual(["A", "B", "S", "C", "D", "E", "F"]);
    const end = insertDiscoveryShelfIntoOrganicIds(organics, payload("page_end"));
    expect(end.map((t) => (t.kind === "organic" ? t.storeId : "S"))).toEqual(["A", "B", "C", "D", "E", "F", "S"]);
    const repeat = insertDiscoveryShelfIntoOrganicIds(organics, payload("repeat_every_n", { everyN: 2, maxShelvesPerPage: 2 }));
    expect(repeat.map((t) => (t.kind === "organic" ? t.storeId : "S"))).toEqual(["A", "B", "S", "C", "D", "S", "E", "F"]);
    const capped = insertDiscoveryShelfIntoOrganicIds(organics, payload("repeat_every_n", { everyN: 2, maxShelvesPerPage: 1 }));
    expect(capped.filter((t) => t.kind === "discovery_shelf")).toHaveLength(1);
    for (const tokens of [top, inline, end, repeat, capped]) {
      expect(stripDiscoveryShelfOrganicIds(tokens)).toEqual(organics);
      expect(stripDiscoveryShelfOrganicIds(tokens)).not.toContain("x1");
    }
  });

  it("S8-S11 exposure mismatch / empty selected / empty new_store hide shelf; source mart does not rewrite restaurant organics", () => {
    const restaurantCfg = parseStoresBrowseDiscoveryShelfConfig({
      enabled: true,
      exposurePrimarySlugs: ["restaurant"],
      sourceMode: "selected",
      sourcePrimarySlugs: ["mart"],
      dataType: "recommended",
      position: "page_top",
      maxItems: 6,
    })!;
    expect(
      composeBrowseDiscoveryShelfPayload({
        config: restaurantCfg,
        pagePrimarySlug: "cafe",
        stores: shelfStores(),
      })
    ).toBeNull();
    expect(
      resolveBrowseShelfSourcePrimarySlugs({
        config: restaurantCfg,
        pagePrimarySlug: "restaurant",
        allPrimarySlugs: ["restaurant", "mart"],
      })
    ).toEqual(["mart"]);
    expect(
      composeBrowseDiscoveryShelfPayload({
        config: restaurantCfg,
        pagePrimarySlug: "restaurant",
        stores: [],
      })
    ).toBeNull();
    expect(parseStoresBrowseDiscoveryShelfPayload({ enabled: true, position: "page_top", stores: [] })).toBeNull();
  });

  it("S12-S15 sort/pagination/refresh recompose without duplicating shelf tokens", () => {
    const organics = ["A", "B", "C", "D"];
    const shelf = payload("page_top");
    const first = insertDiscoveryShelfIntoOrganicIds(organics, shelf);
    const afterSort = insertDiscoveryShelfIntoOrganicIds(["A", "B", "C", "D"], shelf);
    expect(afterSort).toEqual(first);
    const pageAppend = insertDiscoveryShelfIntoOrganicIds(["A", "B", "C", "D", "E", "F"], payload("repeat_every_n", { everyN: 3, maxShelvesPerPage: 2 }));
    expect(pageAppend.filter((t) => t.kind === "discovery_shelf")).toHaveLength(2);
    expect(stripDiscoveryShelfOrganicIds(pageAppend)).toEqual(["A", "B", "C", "D", "E", "F"]);
    const refreshAgain = insertDiscoveryShelfIntoOrganicIds(organics, shelf);
    expect(refreshAgain.filter((t) => t.kind === "discovery_shelf")).toHaveLength(1);
    expect(refreshAgain).toEqual(first);
  });

  it("S16 parse payload without storeId is hidden (no fake rows)", () => {
    expect(
      parseStoresBrowseDiscoveryShelfPayload({
        enabled: true,
        position: "page_top",
        stores: [{ slug: "ghost" }],
      })
    ).toBeNull();
  });

  it("customer active sort is not reset by browse response when URL has no sort", () => {
    const src = readFileSync(join(process.cwd(), "components/stores/browse/StoresBrowsePrimaryView.tsx"), "utf8");
    expect(src).not.toMatch(
      /if \(!parseExplicitBrowseSortParam\(searchParams\?\.get\("sort"\)\)\) \{\s*setListSort\("default"\)/
    );
    expect(src).toContain("handleBrowseSortChange");
    expect(src).toContain("shouldResetBrowseListSortOnScopeChange");
  });
});
