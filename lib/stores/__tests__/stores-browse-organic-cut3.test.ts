/**
 * CUT 3 — BROWSE organic SSOT scoped proofs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROWSE_ORGANIC_MEMBERSHIP_AUTHORITY,
  BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX,
  BROWSE_ORGANIC_SORT_FAST_METRIC,
  BROWSE_ORGANIC_DEFAULT_SORT_ID,
} from "@/lib/stores/browse-organic-contract";
import {
  BROWSE_FEATURED_ITEMS_MAX,
  applyNewAuthorityFastPrepSortToBrowseFilter,
  browseStoreRowMatchesSubFilter,
  type BrowseFilteredStoreRowsResult,
} from "@/lib/stores/stores-browse-build";
import { compareStoreDiscoveryBrowseRows } from "@/lib/stores/store-discovery-browse-sort";
import { resolveStoreDiscoveryRankingAuthority } from "@/lib/stores/discovery/store-discovery-ranking-authority";

describe("CUT 3 BROWSE organic contract", () => {
  it("T1–T2 primary/secondary membership = FK only", () => {
    expect(BROWSE_ORGANIC_MEMBERSHIP_AUTHORITY).toContain("store_category_id");
    const primaryCtx = {
      primary: "restaurant",
      subRaw: "all",
      wantsAllSubs: true,
      categoryId: "cat-r",
      primaryAliases: [],
      topicList: [],
      resolvedTopicId: null,
    };
    expect(
      browseStoreRowMatchesSubFilter({ store_category_id: "cat-r", store_topic_id: "t1" }, primaryCtx)
    ).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: null, business_type: "식당 · 한식" },
        primaryCtx
      )
    ).toBe(false);

    const secondaryCtx = {
      ...primaryCtx,
      wantsAllSubs: false,
      subRaw: "korean",
      resolvedTopicId: "t-korean",
    };
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: "cat-r", store_topic_id: "t-korean" },
        secondaryCtx
      )
    ).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: "cat-r", store_topic_id: null, business_type: "식당 · 한식" },
        secondaryCtx
      )
    ).toBe(false);
  });

  it("T4 default organic ranking authority is NEW wave (fail-closed)", () => {
    expect(resolveStoreDiscoveryRankingAuthority({})).toBe("new");
    expect(BROWSE_ORGANIC_DEFAULT_SORT_ID).toBe("default");
  });

  it("T7 sort=fast uses explicit prep SSOT after NEW hydrate", () => {
    expect(BROWSE_ORGANIC_SORT_FAST_METRIC).toBe("prep_time_minutes_explicit");
    const snap = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-snapshot.ts"),
      "utf8"
    );
    expect(snap).toContain("applyNewAuthorityFastPrepSortToBrowseFilter");

    const filter: BrowseFilteredStoreRowsResult = {
      rows: [
        {
          id: "slow",
          slug: "slow",
          store_name: "Slow",
          rating_avg: 5,
          review_count: 10,
          business_hours_json: { prep_time_minutes: 40 },
        },
        {
          id: "fast",
          slug: "fast",
          store_name: "Fast",
          rating_avg: 4,
          review_count: 1,
          business_hours_json: { prep_time_minutes: 10 },
        },
      ] as BrowseFilteredStoreRowsResult["rows"],
      distById: null,
      statusById: new Map([
        ["slow", "open"],
        ["fast", "open"],
      ]),
      distanceSortMs: 0,
      outOfRangeById: new Map([
        ["slow", false],
        ["fast", false],
      ]),
    };
    const sorted = applyNewAuthorityFastPrepSortToBrowseFilter(
      {
        district: null,
        sort: "fast",
        deliveryDistancePolicy: { enabled: false } as never,
        origin: { lat: null, lng: null } as never,
      },
      filter
    );
    expect(sorted.rows.map((r) => r.id)).toEqual(["fast", "slow"]);
  });

  it("T8 deterministic tie-break for equal prep", () => {
    const ctx = {
      district: null,
      sort: "fast" as const,
      eligibilityRankById: new Map([
        ["a", 0],
        ["b", 0],
      ]),
      // Neutral — this case asserts slug tie-break, not distance/OOR.
      distanceKmById: null,
      outOfRangeById: null,
      hasGeo: false,
      explicitPrepMinutesById: new Map([
        ["a", 15],
        ["b", 15],
      ]),
    };
    const cmp = compareStoreDiscoveryBrowseRows(
      ctx,
      { id: "b", slug: "b", district: null, rating_avg: 1, review_count: 0 },
      { id: "a", slug: "a", district: null, rating_avg: 1, review_count: 0 }
    );
    expect(cmp).toBeGreaterThan(0); // a before b by slug
  });

  it("T9–T10 representative product one authority + max 4", () => {
    expect(BROWSE_FEATURED_ITEMS_MAX).toBe(4);
    expect(BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX).toBe(4);
    const build = readFileSync(join(process.cwd(), "lib/stores/stores-browse-build.ts"), "utf8");
    expect(build).toMatch(/is_featured[\s\S]*sort_order[\s\S]*BROWSE_FEATURED_ITEMS_MAX/);
  });

  it("T12 no HOME composition leakage into browse organic", () => {
    const boundary = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-browse-composition-boundary.ts"),
      "utf8"
    );
    expect(boundary).toMatch(/composerExists:\s*false/);
    const view = readFileSync(
      join(process.cwd(), "components/stores/browse/StoresBrowsePrimaryView.tsx"),
      "utf8"
    );
    expect(view).not.toMatch(/composeStoresHomeFeed/);
  });

  it("T13–T14 paid/coupon insertion wiring preserved (not cutover)", () => {
    const snap = readFileSync(
      join(process.cwd(), "lib/stores/stores-browse-snapshot.ts"),
      "utf8"
    );
    expect(snap).toMatch(/attachStoresBrowseInsertionMeta|homeInsertions|insertion/);
    // soft: file still imports composition insertion path
    const meta = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-browse-insertion-meta.ts"),
      "utf8"
    );
    expect(meta.length).toBeGreaterThan(100);
  });
});
