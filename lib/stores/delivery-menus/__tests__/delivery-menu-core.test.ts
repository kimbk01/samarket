import { describe, expect, it } from "vitest";
import {
  buildDeliveryMenusPublic,
  computeDeliveryMenuStoreIds,
  resolveDefaultMenuIdForStore,
  resolveDeliveryMenuPageStores,
  type DeliveryMenuDataset,
  type DeliveryMenuDbRow,
  type DeliveryMenuVisibleStore,
} from "@/lib/stores/delivery-menus/delivery-menu-compute";
import {
  buildDeliveryMenuPageHref,
  listDeliveryMenuHomeIcons,
  listDeliveryMenuPageTabs,
  listDeliveryMenuRoots,
  readDeliveryMenusFromTaxonomyJson,
  resolveDeliveryMenuItemHref,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import { deliveryMenuLinkHref } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { parseStoreTaxonomySnapshot } from "@/lib/stores/store-taxonomy-canonical";

function menu(p: Partial<DeliveryMenuDbRow> & Pick<DeliveryMenuDbRow, "id" | "slug" | "name_ko">): DeliveryMenuDbRow {
  return {
    parent_id: null,
    name_en: null,
    icon_url: null,
    sort_order: 0,
    is_active: true,
    show_on_home: true,
    home_sort_order: 0,
    show_in_page_tab: true,
    link_target: null,
    pickup_only: false,
    badge_text: null,
    show_feature: false,
    feature_title: null,
    feature_image_url: null,
    feature_bg: null,
    feature_link_target: null,
    start_at: null,
    end_at: null,
    ...p,
  };
}

function store(id: string, cat: string, topic: string | null, pickup = true): DeliveryMenuVisibleStore {
  return {
    id,
    slug: id,
    store_name: `매장 ${id}`,
    profile_image_url: null,
    store_category_id: cat,
    store_topic_id: topic,
    pickup_available: pickup,
  };
}

const food = menu({ id: "r-food", slug: "food", name_ko: "음식배달", sort_order: 1 });
const pickup = menu({ id: "r-pickup", slug: "pickup", name_ko: "픽업", sort_order: 2, pickup_only: true });
const gift = menu({
  id: "r-gift",
  slug: "gift",
  name_ko: "선물하기",
  sort_order: 3,
  show_feature: true,
  feature_title: "마음을 상품권으로",
  feature_link_target: "gift_mall",
});
const pizza = menu({ id: "m-pizza", slug: "pizza", name_ko: "피자", parent_id: "r-food", sort_order: 2, home_sort_order: 1 });
const chicken = menu({ id: "m-chicken", slug: "chicken", name_ko: "치킨", parent_id: "r-food", sort_order: 1, home_sort_order: 2 });
const tools = menu({ id: "m-tools", slug: "tools", name_ko: "공구", parent_id: "r-food", sort_order: 3, home_sort_order: 3 });
const empty = menu({ id: "m-empty", slug: "empty", name_ko: "빈 메뉴", parent_id: "r-food", sort_order: 4 });
const pMeal = menu({ id: "m-pmeal", slug: "p-meal", name_ko: "식사", parent_id: "r-pickup" });
const giftMall = menu({ id: "m-giftmall", slug: "gift-mall", name_ko: "상품권몰", parent_id: "r-gift", link_target: "gift_mall" });

const stores = [
  store("s-pizza", "c-rest", "t-pizza"),
  store("s-both", "c-rest", "t-chicken"),
  store("s-tool", "c-hw", null),
  store("s-nopick", "c-rest", "t-pizza", false),
  store("s-unassigned", "c-rest", "t-pizza"),
];

const dataset: DeliveryMenuDataset = {
  menus: [food, pickup, gift, pizza, chicken, tools, empty, pMeal, giftMall],
  assignments: [
    { menu_id: "m-pizza", store_id: "s-pizza", sort_order: 1 },
    { menu_id: "m-pizza", store_id: "s-both", sort_order: 2 },
    { menu_id: "m-chicken", store_id: "s-both", sort_order: 1 },
    { menu_id: "m-tools", store_id: "s-tool", sort_order: 1 },
    { menu_id: "m-pizza", store_id: "s-nopick", sort_order: 3 },
    { menu_id: "m-pmeal", store_id: "s-pizza", sort_order: 1 },
    { menu_id: "m-pmeal", store_id: "s-nopick", sort_order: 2 },
    { menu_id: "m-pizza", store_id: "s-hidden", sort_order: 9 },
  ],
  shortcuts: [{ root_menu_id: "r-food", store_id: "s-pizza", sort_order: 1, caption: "무료배달" }],
  defaults: [
    { category_id: "c-rest", topic_id: null, menu_id: "m-chicken" },
    { category_id: "c-rest", topic_id: "t-pizza", menu_id: "m-pizza" },
  ],
};

describe("메뉴 매장 계산 — 하나씩 지정 · 업종 무관 · 중복 · 안전장치 폴백", () => {
  it("2차 업종 기본이 1차 기본보다 우선", () => {
    expect(resolveDefaultMenuIdForStore(dataset.defaults, store("x", "c-rest", "t-pizza"))).toBe("m-pizza");
    expect(resolveDefaultMenuIdForStore(dataset.defaults, store("x", "c-rest", "t-korean"))).toBe("m-chicken");
    expect(resolveDefaultMenuIdForStore(dataset.defaults, store("x", "c-hw", null))).toBeNull();
  });

  it("지정 순서대로 · 한 매장 여러 메뉴 · 숨김 매장 제외 · 미지정 노출 매장은 기본 메뉴에 붙임(S6)", () => {
    const { byMenu, unassignedStoreIds } = computeDeliveryMenuStoreIds(dataset, stores);
    expect(byMenu.get("m-pizza")).toEqual(["s-pizza", "s-both", "s-nopick", "s-unassigned"]);
    expect(byMenu.get("m-chicken")).toEqual(["s-both"]);
    expect(byMenu.get("m-tools")).toEqual(["s-tool"]);
    expect(unassignedStoreIds).toEqual(["s-unassigned"]);
  });

  it("고객 메뉴: 매장 0곳 매장 목록 메뉴는 숨김, 화면 연결 메뉴는 유지, 픽업 탭은 픽업 가능 매장만 셈", () => {
    const pub = buildDeliveryMenusPublic(dataset, stores, Date.now());
    expect(pub.map((m) => m.slug)).toEqual(["food", "chicken", "pizza", "tools", "pickup", "p-meal", "gift", "gift-mall"]);
    expect(pub.find((m) => m.slug === "p-meal")?.storeCount).toBe(1);
    expect(pub.find((m) => m.slug === "pizza")?.storeCount).toBe(4);
    expect(pub.find((m) => m.slug === "gift-mall")?.linkTarget).toBe("gift_mall");
    expect(pub.find((m) => m.slug === "gift")?.feature).toMatchObject({ title: "마음을 상품권으로", linkTarget: "gift_mall" });
    expect(pub.find((m) => m.slug === "food")?.shortcuts).toEqual([
      { storeId: "s-pizza", slug: "s-pizza", name: "매장 s-pizza", imageUrl: null, caption: "무료배달" },
    ]);
  });

  it("숨긴 1단·기간 밖 메뉴는 고객에게 없음", () => {
    const off = { ...dataset, menus: dataset.menus.map((m) => (m.id === "r-pickup" ? { ...m, is_active: false } : m)) };
    expect(buildDeliveryMenusPublic(off, stores, Date.now()).some((m) => m.slug === "pickup" || m.slug === "p-meal")).toBe(false);
    const future = {
      ...dataset,
      menus: dataset.menus.map((m) => (m.id === "m-tools" ? { ...m, start_at: "2999-01-01T00:00:00Z" } : m)),
    };
    expect(buildDeliveryMenusPublic(future, stores, Date.now()).some((m) => m.slug === "tools")).toBe(false);
  });

  it("메뉴 페이지: 「홈」 탭 = 1단 매장 합집합(중복 1번), 탭 = 그 메뉴, 픽업 = 픽업 가능만, 업종 목록 계산", () => {
    const home = resolveDeliveryMenuPageStores(dataset, stores, { rootSlug: "food", menuSlug: null, nowMs: Date.now() });
    expect(home?.storeIds).toEqual(["s-both", "s-pizza", "s-nopick", "s-unassigned", "s-tool"]);
    expect(home?.categoryIds.sort()).toEqual(["c-hw", "c-rest"]);
    const tab = resolveDeliveryMenuPageStores(dataset, stores, { rootSlug: "food", menuSlug: "tools", nowMs: Date.now() });
    expect(tab).toMatchObject({ menuId: "m-tools", storeIds: ["s-tool"], categoryIds: ["c-hw"] });
    const pick = resolveDeliveryMenuPageStores(dataset, stores, { rootSlug: "pickup", menuSlug: null, nowMs: Date.now() });
    expect(pick).toMatchObject({ pickupOnly: true, storeIds: ["s-pizza"] });
    expect(resolveDeliveryMenuPageStores(dataset, stores, { rootSlug: "restaurant", menuSlug: null, nowMs: Date.now() })).toBeNull();
    expect(resolveDeliveryMenuPageStores(dataset, stores, { rootSlug: "food", menuSlug: "nope", nowMs: Date.now() })).toBeNull();
  });
});

describe("고객 읽기 — 홈 아이콘·페이지 탭·주소", () => {
  const pub = buildDeliveryMenusPublic(dataset, stores, Date.now());
  const json = JSON.parse(JSON.stringify({ deliveryMenus: pub }));

  it("taxonomy JSON 왕복 · 형식 불량 버림", () => {
    const parsed = readDeliveryMenusFromTaxonomyJson({ deliveryMenus: [...json.deliveryMenus, { id: "", slug: "x" }] });
    expect(parsed).toHaveLength(pub.length);
  });

  it("상단 탭 순서 · 홈 아이콘(홈 순서) · 페이지 탭(탭 순서, 화면 연결 제외)", () => {
    expect(listDeliveryMenuRoots(pub).map((m) => m.slug)).toEqual(["food", "pickup", "gift"]);
    expect(listDeliveryMenuHomeIcons(pub, "r-food").map((m) => m.slug)).toEqual(["pizza", "chicken", "tools"]);
    expect(listDeliveryMenuPageTabs(pub, "food")?.map((m) => m.slug)).toEqual(["chicken", "pizza", "tools"]);
    expect(listDeliveryMenuPageTabs(pub, "gift")).toEqual([]);
    expect(listDeliveryMenuPageTabs(pub, "restaurant")).toBeNull();
  });

  it("아이콘 주소: 매장 목록 → 메뉴 페이지 탭, 화면 연결 → 기존 화면", () => {
    expect(buildDeliveryMenuPageHref("food")).toBe("/stores/browse/food");
    const pizzaPub = pub.find((m) => m.slug === "pizza")!;
    expect(resolveDeliveryMenuItemHref("food", pizzaPub)).toBe("/stores/browse/food?menu=pizza");
    const mall = pub.find((m) => m.slug === "gift-mall")!;
    expect(resolveDeliveryMenuItemHref("gift", mall)).toBe("/stores/gift-mall");
    expect(deliveryMenuLinkHref("gift_platform")).toBe("/stores/gift-mall?scope=platform");
    expect(deliveryMenuLinkHref("gift_owned")).toBe("/orders/activity?tab=gifts&giftTab=owned");
    expect(deliveryMenuLinkHref("coupons")).toBe("/orders/activity?tab=coupons");
  });

  it("업종 스냅샷은 그대로 두고 메뉴만 따로 싣는다 (업종 이름 덮어쓰기 없음)", () => {
    const categories = [{ id: "c-rest", name: "식당", name_en: "Restaurant", slug: "restaurant", sort_order: 1, image_url: null }];
    const snap = parseStoreTaxonomySnapshot({ ok: true, categories, topics: [], deliveryMenus: json.deliveryMenus });
    expect(snap?.categories.map((c) => c.name)).toEqual(["식당"]);
    expect(snap?.menus?.length).toBe(pub.length);
    expect(parseStoreTaxonomySnapshot({ ok: true, categories, topics: [] })?.menus).toBeUndefined();
  });
});
