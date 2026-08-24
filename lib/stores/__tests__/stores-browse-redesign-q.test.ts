import { describe, expect, it } from "vitest";
import {
  STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP,
  compareStoreDiscoveryCustomerGroup,
  storeDiscoveryCustomerGroupFromEligibilityRank,
} from "@/lib/stores/store-discovery-customer-group";
import { sortStoreDiscoveryBrowseRows, type StoreDiscoverySortContext } from "@/lib/stores/store-discovery-browse-sort";
import {
  applyStoreDiscoveryExposureRotation,
  resolveStoreDiscoveryExposureTimeSlice,
} from "@/lib/stores/store-discovery-exposure";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA,
  parseStoresBrowseRankingCriteria,
} from "@/lib/stores/stores-browse-ranking-criteria";
import {
  buildBrowseDiscoveryShelfItems,
  composeBrowseDiscoveryShelfPayload,
  insertDiscoveryShelfIntoOrganicIds,
  parseStoresBrowseDiscoveryShelfConfig,
} from "@/lib/stores/stores-browse-discovery-shelf";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";

type Row = {
  id: string;
  slug: string;
  district: string | null;
  rating_avg: number | null;
  review_count: number | null;
};

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    slug: partial.slug ?? partial.id,
    district: partial.district ?? null,
    rating_avg: partial.rating_avg ?? 4,
    review_count: partial.review_count ?? 1,
    ...partial,
  };
}

function ctx(overrides: Partial<StoreDiscoverySortContext> = {}): StoreDiscoverySortContext {
  return {
    district: "jongno",
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

describe("stores browse redesign Q1-Q20", () => {
  it("maps 6 ranks to customer groups without merging states", () => {
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank0).toBe("GROUP_A");
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank1).toBe("GROUP_B");
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank2).toBe("GROUP_B");
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank3).toBe("GROUP_B");
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank4).toBe("GROUP_B");
    expect(STORE_DISCOVERY_ELIGIBILITY_TO_CUSTOMER_GROUP.rank5).toBe("GROUP_B");
    expect(storeDiscoveryCustomerGroupFromEligibilityRank(0)).toBe("A");
    expect(storeDiscoveryCustomerGroupFromEligibilityRank(3)).toBe("B");
    expect(compareStoreDiscoveryCustomerGroup(0, 5)).toBeLessThan(0);
  });

  it("Q4 orderable group stays above non-orderable on default", () => {
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "closed" }), row({ id: "open" })],
      ctx({
        eligibilityRankById: new Map([
          ["open", 0],
          ["closed", 5],
        ]),
        distanceKmById: new Map([
          ["open", 9],
          ["closed", 0.1],
        ]),
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["open", "closed"]);
  });

  it("Q5 customer distance keeps groups", () => {
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "far-open" }), row({ id: "near-closed" })],
      ctx({
        sort: "distance",
        eligibilityRankById: new Map([
          ["far-open", 0],
          ["near-closed", 5],
        ]),
        distanceKmById: new Map([
          ["far-open", 8],
          ["near-closed", 0.2],
        ]),
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["far-open", "near-closed"]);
  });

  it("Q6 customer rating keeps groups", () => {
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "low-open", rating_avg: 3 }), row({ id: "high-closed", rating_avg: 5 })],
      ctx({
        sort: "rating",
        eligibilityRankById: new Map([
          ["low-open", 0],
          ["high-closed", 5],
        ]),
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["low-open", "high-closed"]);
  });

  it("Q7 customer popular keeps groups", () => {
    const sorted = sortStoreDiscoveryBrowseRows(
      [row({ id: "low-open" }), row({ id: "high-closed" })],
      ctx({
        sort: "popular",
        eligibilityRankById: new Map([
          ["low-open", 0],
          ["high-closed", 5],
        ]),
        completedOrderCount30dById: new Map([
          ["low-open", 1],
          ["high-closed", 900],
        ]),
      })
    );
    expect(sorted.map((r) => r.id)).toEqual(["low-open", "high-closed"]);
  });

  it("Q8 admin criteria order changes default order within the same group", () => {
    const rows = [row({ id: "near", rating_avg: 3 }), row({ id: "far-rated", rating_avg: 5 })];
    const ranks = new Map([
      ["near", 0],
      ["far-rated", 0],
    ]);
    const dist = new Map([
      ["near", 0.4],
      ["far-rated", 4],
    ]);
    const byDistance = sortStoreDiscoveryBrowseRows(
      rows,
      ctx({
        eligibilityRankById: ranks,
        distanceKmById: dist,
        rankingCriteria: ["distance", "rating"],
      })
    );
    const byRating = sortStoreDiscoveryBrowseRows(
      rows,
      ctx({
        eligibilityRankById: ranks,
        distanceKmById: dist,
        rankingCriteria: ["rating", "distance"],
      })
    );
    expect(byDistance.map((r) => r.id)).toEqual(["near", "far-rated"]);
    expect(byRating.map((r) => r.id)).toEqual(["far-rated", "near"]);
  });

  it("Q9-Q10 secondary rankingCriteria in product_config does not override primary", () => {
    const primary = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: null,
      primaryRow: {
        scopeKey: "restaurant",
        primarySlug: "restaurant",
        subSlug: null,
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: false,
        couponEnabled: false,
        maxInsertion: null,
        intervalEveryN: 8,
        presentationMode: "card_benefit_integrated",
        scheduleStart: null,
        scheduleEnd: null,
        productConfig: { rankingCriteria: ["popular", "distance"] },
      },
      subRow: null,
    });
    expect(primary.rankingCriteria).toEqual(["popular", "distance", "rating", "reviews"]);

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
      productConfig: { rankingCriteria: ["popular", "distance"], popularityWindowDays: 90 },
    };

    const inherited = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow,
      subRow: null,
    });
    expect(inherited.rankingCriteria).toEqual(["popular", "distance", "rating", "reviews"]);
    expect(inherited.popularityWindowDays).toBe(90);

    const overridden = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "korean",
      primaryRow,
      subRow: {
        scopeKey: "restaurant/korean",
        primarySlug: "restaurant",
        subSlug: "korean",
        enabled: true,
        displayTitleKo: null,
        displayTitleEn: null,
        adEnabled: "inherit",
        couponEnabled: "inherit",
        maxInsertion: "inherit",
        intervalEveryN: "inherit",
        presentationMode: "inherit",
        scheduleStart: "inherit",
        scheduleEnd: "inherit",
        productConfig: { rankingCriteria: ["rating", "distance"] },
      },
    });
    expect(overridden.rankingCriteria).toEqual(["popular", "distance", "rating", "reviews"]);
    expect(overridden.popularityWindowDays).toBe(90);
  });

  it("Q11 customer sort is not the admin stack; default uses admin criteria", () => {
    const rows = [row({ id: "a", rating_avg: 5 }), row({ id: "b", rating_avg: 3 })];
    const ranks = new Map([
      ["a", 0],
      ["b", 0],
    ]);
    const dist = new Map([
      ["a", 5],
      ["b", 1],
    ]);
    const admin = sortStoreDiscoveryBrowseRows(
      rows,
      ctx({
        sort: "default",
        eligibilityRankById: ranks,
        distanceKmById: dist,
        rankingCriteria: ["distance", "rating"],
      })
    );
    const customer = sortStoreDiscoveryBrowseRows(
      rows,
      ctx({
        sort: "rating",
        eligibilityRankById: ranks,
        distanceKmById: dist,
        rankingCriteria: ["distance", "rating"],
      })
    );
    expect(admin.map((r) => r.id)).toEqual(["b", "a"]);
    expect(customer.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("Q12-Q13 rotation is deterministic in-window and can change across windows", () => {
    const recommended = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" }), row({ id: "d" })];
    const eligibilityRankById = new Map(recommended.map((r) => [r.id, 0] as const));
    const t0 = 1_700_000_000_000;
    const slice = resolveStoreDiscoveryExposureTimeSlice(t0);
    const a = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById,
      exposureScope: "browse\0restaurant\0all",
      nowMs: t0,
    });
    const b = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById,
      exposureScope: "browse\0restaurant\0all",
      nowMs: t0 + 10_000,
    });
    const c = applyStoreDiscoveryExposureRotation({
      recommendedSorted: recommended,
      eligibilityRankById,
      exposureScope: "browse\0restaurant\0all",
      nowMs: t0 + 3_600_000,
    });
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
    expect(resolveStoreDiscoveryExposureTimeSlice(t0 + 10_000)).toBe(slice);
    expect(c.map((r) => r.id).join(",")).not.toEqual("");
    expect(parseStoresBrowseRankingCriteria(["distance", "popular", "distance"])).toEqual([
      "distance",
      "popular",
    ]);
    expect(STORES_BROWSE_CANONICAL_DEFAULT_CRITERIA[0]).toBe("popular");
  });

  it("Q15-Q19 sibling topic shelf uses canonical href and excludes current topic", () => {
    const items = buildBrowseDiscoveryShelfItems({
      primarySlug: "restaurant",
      currentSubSlug: "korean",
      topics: [
        { slug: "korean", name: "한식" },
        { slug: "chinese", name: "중식" },
        { slug: "snack", name: "분식" },
      ],
      maxItems: 8,
    });
    expect(items.map((i) => i.topicSlug)).toEqual(["chinese", "snack"]);
    expect(items[0]?.href).toBe(storesBrowsePath("restaurant", "chinese"));
    const payload = composeBrowseDiscoveryShelfPayload({
      config: {
        enabled: true,
        scope: "sibling_topics",
        position: "inline_after_n",
        afterN: 2,
        maxItems: 8,
      },
      primarySlug: "restaurant",
      currentSubSlug: "korean",
      topics: [
        { slug: "korean", name: "한식" },
        { slug: "chinese", name: "중식" },
      ],
    });
    expect(payload?.position).toBe("inline_after_n");
    const tokens = insertDiscoveryShelfIntoOrganicIds(["s1", "s2", "s3"], payload);
    expect(tokens.map((t) => t.kind)).toEqual(["organic", "organic", "discovery_shelf", "organic"]);
    expect(tokens.filter((t) => t.kind === "organic").map((t) => (t.kind === "organic" ? t.storeId : ""))).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("Q17 stored TOP position is coerced to inline_after_n", () => {
    const parsed = parseStoresBrowseDiscoveryShelfConfig({
      enabled: true,
      position: "top",
      afterN: 6,
      maxItems: 6,
    });
    expect(parsed?.position).toBe("inline_after_n");
    expect(parsed?.afterN).toBe(6);
  });
});
