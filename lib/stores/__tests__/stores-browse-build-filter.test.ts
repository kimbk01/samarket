import { describe, expect, it } from "vitest";
import {
  browseOrphanMatchesChosenSub,
  browseStoreRowMatchesSubFilter,
  buildBrowseTopicNameToSlugMap,
  buildBrowseStoresOrFilter,
  resolveBrowseFilteredStoreRows,
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

describe("browseStoreRowMatchesSubFilter", () => {
  it("sub=chicken 에서 store_topic_id undefined 는 legacy business_type 만 통과", () => {
    const ctx = {
      primary: "food",
      subRaw: "chicken",
      wantsAllSubs: false,
      primaryAliases: ["food", "음식"],
      topicList,
      resolvedTopicId: "t-chicken",
    };
    expect(
      browseStoreRowMatchesSubFilter(
        {
          store_category_id: "cat-food",
          store_topic_id: undefined,
          business_type: "음식 · 치킨",
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        {
          store_category_id: "cat-food",
          store_topic_id: undefined,
          business_type: "음식 · 피자",
        },
        ctx,
      ),
    ).toBe(false);
  });

  it("sub=chicken 에서 다른 store_topic_id 는 제외 (legacy 우회 없음)", () => {
    const ctx = {
      primary: "food",
      subRaw: "chicken",
      wantsAllSubs: false,
      primaryAliases: ["food", "음식"],
      topicList,
      resolvedTopicId: "t-chicken",
    };
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

  it("sub=all 이면 category 연결 매장은 topic 무관 포함", () => {
    const ctx = {
      primary: "food",
      subRaw: "all",
      wantsAllSubs: true,
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
  });

  it("orphan 은 business_type sub 일치 시만 포함", () => {
    const ctx = {
      primary: "food",
      subRaw: "chicken",
      wantsAllSubs: false,
      primaryAliases: ["food", "음식"],
      topicList,
      resolvedTopicId: "t-chicken",
    };
    const map = buildBrowseTopicNameToSlugMap(topicList);
    expect(browseOrphanMatchesChosenSub({ subSlugGuess: "치킨", subLabelGuess: "치킨" }, {
      wantsAllSubs: false,
      subRaw: "chicken",
      topicNameToSlug: map,
    })).toBe(true);
    expect(
      browseStoreRowMatchesSubFilter(
        { store_category_id: null, business_type: "음식 · 피자" },
        ctx,
      ),
    ).toBe(false);
  });
});

describe("resolveBrowseFilteredStoreRows", () => {
  it("중복 id 없이 sub 필터 후 행만 반환", () => {
    const rows = resolveBrowseFilteredStoreRows(
      { primary: "food", subRaw: "chicken", wantsAllSubs: false },
      slice(),
      [
        { id: "a", store_category_id: "cat-food", store_topic_id: "t-chicken", store_name: "A", slug: "a" },
        { id: "b", store_category_id: "cat-food", store_topic_id: undefined, business_type: "음식 · 치킨", store_name: "B", slug: "b" },
        { id: "c", store_category_id: "cat-food", store_topic_id: "t-pizza", store_name: "C", slug: "c" },
        { id: "d", store_category_id: null, business_type: "음식 · 치킨", store_name: "D", slug: "d" },
      ],
    );
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b", "d"]);
  });
});

describe("buildBrowseStoresOrFilter", () => {
  it("특정 sub 에서 category+null topic legacy OR 포함", () => {
    const or = buildBrowseStoresOrFilter("cat-food", "t-chicken", false, [
      "business_type.ilike.%food% ·%chicken%",
    ]);
    expect(or).toContain("store_topic_id.is.null");
    expect(or).toContain("store_topic_id.eq.t-chicken");
  });
});
