import { describe, expect, it } from "vitest";
import {
  deliveryMenuIncludesStore,
  deliveryMenuStoreFilterCacheToken,
  type DeliveryMenuPublic,
  type DeliveryMenuStoreFilter,
} from "@/lib/stores/delivery-menus/delivery-menu-types";
import {
  applyDeliveryMenusToCategories,
  buildDeliveryMenuTabHref,
  listDeliveryMenuTabsForPrimary,
  pruneDeliveryMenusToVisibleTaxonomy,
  readDeliveryMenusFromTaxonomyJson,
  resolveDeliveryHomeMenuEntries,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import { parseStoreTaxonomySnapshot } from "@/lib/stores/store-taxonomy-canonical";

const categories = [
  { id: "c-rest", name: "식당", name_en: "Restaurant", slug: "restaurant", sort_order: 1, image_url: "cat.png" },
  { id: "c-mart", name: "마트", name_en: "Mart", slug: "mart", sort_order: 2, image_url: null },
];

function menu(p: Partial<DeliveryMenuPublic> & Pick<DeliveryMenuPublic, "id" | "slug" | "primarySlug" | "nameKo">): DeliveryMenuPublic {
  return {
    parentId: null,
    nameEn: null,
    iconUrl: null,
    sortOrder: 0,
    showOnHome: false,
    homeSortOrder: 0,
    topicSlugs: [],
    hasStoreOverrides: false,
    ...p,
  };
}

const rootFood = menu({ id: "m1", slug: "food", primarySlug: "restaurant", nameKo: "음식배달", showOnHome: true, homeSortOrder: 2, iconUrl: "food.png" });
const childStew = menu({ id: "m2", slug: "stew", parentId: "m1", primarySlug: "restaurant", nameKo: "찜·탕", sortOrder: 20, topicSlugs: ["korean"] });
const childSnack = menu({ id: "m3", slug: "snack", parentId: "m1", primarySlug: "restaurant", nameKo: "분식", sortOrder: 10, showOnHome: true, homeSortOrder: 1, topicSlugs: ["snack"] });

describe("deliveryMenuIncludesStore — 제외 > 추가 > 연결 업종", () => {
  const filter: DeliveryMenuStoreFilter = {
    menuId: "m2",
    topicIds: new Set(["t-korean"]),
    includeStoreIds: new Set(["s-add"]),
    excludeStoreIds: new Set(["s-ex"]),
  };
  it("keeps stores of linked topics", () => {
    expect(deliveryMenuIncludesStore(filter, { id: "s1", store_topic_id: "t-korean" })).toBe(true);
    expect(deliveryMenuIncludesStore(filter, { id: "s2", store_topic_id: "t-pizza" })).toBe(false);
  });
  it("include adds a store outside linked topics; exclude wins over topic", () => {
    expect(deliveryMenuIncludesStore(filter, { id: "s-add", store_topic_id: "t-pizza" })).toBe(true);
    expect(deliveryMenuIncludesStore(filter, { id: "s-ex", store_topic_id: "t-korean" })).toBe(false);
  });
  it("empty topic set = only included stores", () => {
    const onlyAdds: DeliveryMenuStoreFilter = { ...filter, topicIds: new Set() };
    expect(deliveryMenuIncludesStore(onlyAdds, { id: "s1", store_topic_id: "t-korean" })).toBe(false);
    expect(deliveryMenuIncludesStore(onlyAdds, { id: "s-add", store_topic_id: null })).toBe(true);
  });
  it("cache token changes with composition", () => {
    const a = deliveryMenuStoreFilterCacheToken(filter);
    const b = deliveryMenuStoreFilterCacheToken({ ...filter, excludeStoreIds: new Set() });
    expect(a).not.toBe(b);
    expect(deliveryMenuStoreFilterCacheToken(null)).toBe("none");
  });
});

describe("menu overlay — 메뉴 없음 = 업종 그대로 (복구 스위치)", () => {
  it("returns categories unchanged without menus", () => {
    expect(applyDeliveryMenusToCategories(categories, [])).toBe(categories);
    expect(listDeliveryMenuTabsForPrimary([], "restaurant")).toBeNull();
    const home = resolveDeliveryHomeMenuEntries(categories, undefined);
    expect(home.map((e) => e.homeHref)).toEqual([
      "/stores/browse/restaurant?sub=all",
      "/stores/browse/mart?sub=all",
    ]);
  });

  it("with menus: only primaries having a 1단 menu, renamed with menu icon/order; ids & slugs kept", () => {
    const out = applyDeliveryMenusToCategories(categories, [rootFood, childStew]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "c-rest", slug: "restaurant", name: "음식배달", image_url: "food.png" });
  });

  it("tabs are 2단 menus of the primary in sort order", () => {
    const tabs = listDeliveryMenuTabsForPrimary([rootFood, childStew, childSnack], "restaurant");
    expect(tabs?.map((t) => t.slug)).toEqual(["snack", "stew"]);
    expect(listDeliveryMenuTabsForPrimary([rootFood], "mart")).toBeNull();
  });

  it("home entries: 1단·2단 marked for home, home order; 2단 opens parent page with that tab", () => {
    const entries = resolveDeliveryHomeMenuEntries(categories, [rootFood, childStew, childSnack]);
    expect(entries.map((e) => e.slug)).toEqual(["snack", "food"]);
    expect(entries[0]?.homeHref).toBe(buildDeliveryMenuTabHref("restaurant", "snack"));
    expect(entries[0]?.homeHref).toBe("/stores/browse/restaurant?sub=all&menu=snack");
    expect(entries[1]?.homeHref).toBe("/stores/browse/restaurant?sub=all");
    expect(entries.every((e) => e.homePrimarySlug === "restaurant")).toBe(true);
  });

  it("parses deliveryMenus from taxonomy JSON and drops malformed rows", () => {
    const parsed = readDeliveryMenusFromTaxonomyJson({
      deliveryMenus: [rootFood, { id: "", slug: "x" }, { ...childStew, slug: "STEW" }],
    });
    expect(parsed.map((m) => m.slug)).toEqual(["food", "stew"]);
  });

  it("policy-hidden topics/primaries drop their menus (P-01 유지)", () => {
    const pruned = pruneDeliveryMenusToVisibleTaxonomy(
      [rootFood, childStew, childSnack, { ...childStew, id: "m4", slug: "manual", topicSlugs: [], hasStoreOverrides: true }],
      [{ slug: "restaurant" }],
      [{ slug: "snack" }]
    );
    expect(pruned.map((m) => m.slug)).toEqual(["food", "snack", "manual"]);
    expect(pruneDeliveryMenusToVisibleTaxonomy([rootFood], [{ slug: "mart" }], [])).toEqual([]);
  });

  it("parseStoreTaxonomySnapshot carries menus and overlays categories", () => {
    const snap = parseStoreTaxonomySnapshot({
      ok: true,
      categories,
      topics: [{ id: "t1", store_category_id: "c-rest", name: "한식", slug: "korean", sort_order: 1 }],
      deliveryMenus: [rootFood, childStew],
    });
    expect(snap?.menus?.map((m) => m.slug)).toEqual(["food", "stew"]);
    expect(snap?.categories.map((c) => c.name)).toEqual(["음식배달"]);
    const plain = parseStoreTaxonomySnapshot({ ok: true, categories, topics: [] });
    expect(plain?.menus).toBeUndefined();
    expect(plain?.categories).toHaveLength(2);
  });
});
