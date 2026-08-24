import { describe, expect, it } from "vitest";
import {
  applyBrowseSubFilterContractToPrefetchedFilter,
  browseOrphanMatchesChosenSub,
  browseStoreRowMatchesSubFilter,
  buildBrowseTopicNameToSlugMap,
  buildBrowseStoresOrFilter,
  resolveBrowseFilteredStoreRows,
  type BrowseFilteredStoreRowsResult,
} from "@/lib/stores/stores-browse-build";
import type { BrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";

const topicList = [
  { id: "t-chicken", slug: "chicken", name: "치킨" },
  { id: "t-pizza", slug: "pizza", name: "피자" },
];

function slice(overrides: Partial<BrowseTaxonomySlice> = {}): BrowseTaxonomySlice {
  return {
    categoryId: "cat-food",
    categorySlug: "food",
    categoryName: "음식",
    primaryAliases: ["food", "음식"],
    topicList,
    resolvedTopicId: "t-chicken",
    selectedTopicMeta: { slug: "chicken", name: "치킨" },
    unknownPrimary: false,
    unknownTopic: false,
    ...overrides,
  };
}

describe("browseStoreRowMatchesSubFilter — CUT 3 FK membership", () => {
  it("sub=chicken — only matching store_topic_id (no business_type)", () => {
    const ctx = {
      primary: "food",
      subRaw: "chicken",
      wantsAllSubs: false,
      categoryId: "cat-food",
      primaryAliases: ["food", "음식"],
      topicList,
      resolvedTopicId: "t-chicken",
    };
    expect(
      browseStoreRowMatchesSubFilter(
        {
          store_category_id: "cat-food",
          store_topic_id: "t-chicken",
          business_type: null,
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        {
          store_category_id: "cat-food",
          store_topic_id: undefined,
          business_type: "음식 · 치킨",
        },
        ctx,
      ),
    ).toBe(false);
    expect(
      browseStoreRowMatchesSubFilter(
        {
          store_category_id: "cat-food",
          store_topic_id: "t-pizza",
          business_type: "음식 · 치킨",
        },
        ctx,
      ),
    ).toBe(false);
  });

  it("sub=all — primary category FK only (wrong category rejected)", () => {
    const ctx = {
      primary: "food",
      subRaw: "all",
      wantsAllSubs: true,
      categoryId: "cat-food",
      primaryAliases: ["food", "음식"],
      topicList,
      resolvedTopicId: null,
    };
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: "cat-food", store_topic_id: "t-pizza", business_type: null },
        ctx,
      ),
    ).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: "cat-other", store_topic_id: null, business_type: "음식 · 치킨" },
        ctx,
      ),
    ).toBe(false);
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: null, business_type: "음식 · 치킨" },
        ctx,
      ),
    ).toBe(false);
  });

  it("legacy orphan helper still exists but is not membership authority", () => {
    const map = buildBrowseTopicNameToSlugMap(topicList);
    expect(
      browseOrphanMatchesChosenSub(
        { subSlugGuess: "치킨", subLabelGuess: "치킨" },
        {
          wantsAllSubs: false,
          subRaw: "chicken",
          topicNameToSlug: map,
        },
      ),
    ).toBe(true);
  });
});

describe("resolveBrowseFilteredStoreRows", () => {
  it("FK membership only — legacy business_type orphans excluded", () => {
    const rows = resolveBrowseFilteredStoreRows(
      { primary: "food", subRaw: "chicken", wantsAllSubs: false },
      slice(),
      [
        {
          id: "a",
          store_category_id: "cat-food",
          store_topic_id: "t-chicken",
          store_name: "A",
          slug: "a",
        },
        {
          id: "b",
          store_category_id: "cat-food",
          store_topic_id: undefined,
          business_type: "음식 · 치킨",
          store_name: "B",
          slug: "b",
        },
        {
          id: "c",
          store_category_id: "cat-food",
          store_topic_id: "t-pizza",
          store_name: "C",
          slug: "c",
        },
        {
          id: "d",
          store_category_id: null,
          business_type: "음식 · 치킨",
          store_name: "D",
          slug: "d",
        },
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("applyBrowseSubFilterContractToPrefetchedFilter", () => {
  it("NEW live over-fetch — FK trim only (legacy business_type not membership)", () => {
    const liveRows = [
      {
        id: "keep-topic",
        store_category_id: "cat-food",
        store_topic_id: "t-chicken",
        store_name: "Keep",
        slug: "keep",
      },
      {
        id: "leak-null",
        store_category_id: "cat-food",
        store_topic_id: null,
        business_type: null,
        store_name: "Leak",
        slug: "leak",
      },
      {
        id: "legacy-ok",
        store_category_id: "cat-food",
        store_topic_id: null,
        business_type: "음식 · 치킨",
        store_name: "Legacy",
        slug: "legacy",
      },
    ];
    const prefetched: BrowseFilteredStoreRowsResult = {
      rows: liveRows as unknown as BrowseFilteredStoreRowsResult["rows"],
      distById: new Map([
        ["keep-topic", 1],
        ["leak-null", 2],
        ["legacy-ok", 3],
      ]),
      statusById: new Map([
        ["keep-topic", "open"],
        ["leak-null", "open"],
        ["legacy-ok", "open"],
      ]),
      distanceSortMs: 0,
      outOfRangeById: new Map([
        ["keep-topic", false],
        ["leak-null", false],
        ["legacy-ok", false],
      ]),
    };
    const next = applyBrowseSubFilterContractToPrefetchedFilter(
      { primary: "food", subRaw: "chicken", wantsAllSubs: false },
      slice(),
      prefetched,
    );
    expect(next.rows.map((r) => r.id)).toEqual(["keep-topic"]);
    expect([...next.distById!.keys()]).toEqual(["keep-topic"]);
    expect(next.statusById.has("leak-null")).toBe(false);
    expect(next.statusById.has("legacy-ok")).toBe(false);
  });
});

describe("buildBrowseStoresOrFilter", () => {
  it("CUT 3 empty orphans → FK-only OR filter", () => {
    const or = buildBrowseStoresOrFilter("cat-food", "t-chicken", false, []);
    expect(or).toBe("and(store_category_id.eq.cat-food,store_topic_id.eq.t-chicken)");
    expect(or).not.toContain("business_type");
  });

  it("legacy orphan parts still composable if passed (not used by CUT 3 callers)", () => {
    const or = buildBrowseStoresOrFilter("cat-food", "t-chicken", false, [
      "business_type.ilike.%food% ·%chicken%",
    ]);
    expect(or).toContain("store_topic_id.is.null");
    expect(or).toContain("store_topic_id.eq.t-chicken");
  });
});
