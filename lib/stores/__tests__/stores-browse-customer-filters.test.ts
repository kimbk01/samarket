import { describe, expect, it } from "vitest";
import {
  appendStoresBrowseCustomerFilters,
  applyStoresBrowseCustomerFilters,
  mergeStoresBrowseMenuBodies,
  parseStoresBrowseCustomerFilters,
  sortStoresBrowseByFavorites,
  STORES_BROWSE_CUSTOMER_FILTERS_EMPTY,
  storesBrowseCustomerFiltersKey,
} from "@/lib/stores/stores-browse-customer-filters";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";

function item(p: Partial<BrowseStoreListItem> & { id: string }): BrowseStoreListItem {
  return {
    status: "open",
    rating: 0,
    reviewCount: 0,
    deliveryAvailable: true,
    pickupAvailable: true,
    reservationAvailable: false,
    distanceKm: null,
    prepMinutes: null,
    commerce: { minOrderPhp: null },
    ...p,
  } as unknown as BrowseStoreListItem;
}

function body(stores: BrowseStoreListItem[], coupons: string[] = []) {
  return {
    stores,
    meta: {
      browseInsertion: {
        rows: stores.map((s) => ({ kind: "organic", storeId: s.id })),
        organicIds: stores.map((s) => s.id),
        couponBadgeByStoreId: Object.fromEntries(coupons.map((id) => [id, { title: "쿠폰" }])),
      },
    },
  };
}

describe("4단 필터 칩 — 쿼리 왕복", () => {
  it("허용 값만 읽고, 빈 필터는 쿼리에 싣지 않는다", () => {
    const f = parseStoresBrowseCustomerFilters(new URLSearchParams("coupon=1&method=pickup&rating=4&min_order=300&reserve=1"));
    expect(f).toEqual({ coupon: true, method: "pickup", minRating: 4, maxMinOrderPhp: 300, reservation: true });
    expect(parseStoresBrowseCustomerFilters(new URLSearchParams("rating=4.2&min_order=77&method=x"))).toEqual(
      STORES_BROWSE_CUSTOMER_FILTERS_EMPTY
    );
    const q = new URLSearchParams();
    appendStoresBrowseCustomerFilters(q, STORES_BROWSE_CUSTOMER_FILTERS_EMPTY);
    expect(q.toString()).toBe("");
    appendStoresBrowseCustomerFilters(q, f);
    expect(parseStoresBrowseCustomerFilters(q)).toEqual(f);
    expect(storesBrowseCustomerFiltersKey(STORES_BROWSE_CUSTOMER_FILTERS_EMPTY)).toBe("none");
  });
});

describe("필터 적용 — 목록·삽입 행 같은 집합", () => {
  const stores = [
    item({ id: "a", rating: 4.6, commerce: { minOrderPhp: 300 } as never }),
    item({ id: "b", rating: 3.9, deliveryAvailable: false }),
    item({ id: "c", rating: 4.1, pickupAvailable: false, reservationAvailable: true, commerce: { minOrderPhp: 600 } as never }),
  ];
  it("쿠폰·배달방식·별점·최소주문·예약", () => {
    const ids = (f: Partial<typeof STORES_BROWSE_CUSTOMER_FILTERS_EMPTY>) =>
      applyStoresBrowseCustomerFilters(body(stores, ["c"]), { ...STORES_BROWSE_CUSTOMER_FILTERS_EMPTY, ...f }).stores.map((s) => s.id);
    expect(ids({ coupon: true })).toEqual(["c"]);
    expect(ids({ method: "delivery" })).toEqual(["a", "c"]);
    expect(ids({ method: "pickup" })).toEqual(["a", "b"]);
    expect(ids({ minRating: 4 })).toEqual(["a", "c"]);
    expect(ids({ maxMinOrderPhp: 500 })).toEqual(["a", "b"]);
    expect(ids({ reservation: true })).toEqual(["c"]);
    const out = applyStoresBrowseCustomerFilters(body(stores), { ...STORES_BROWSE_CUSTOMER_FILTERS_EMPTY, minRating: 4.5 });
    expect(out.meta.browseInsertion?.rows).toEqual([{ kind: "organic", storeId: "a" }]);
  });
  it("픽업 상단 탭은 필터 없이도 픽업 가능 매장만", () => {
    expect(
      applyStoresBrowseCustomerFilters(body(stores), STORES_BROWSE_CUSTOMER_FILTERS_EMPTY, { pickupOnly: true }).stores.map((s) => s.id)
    ).toEqual(["a", "b"]);
  });
});

describe("찜 많은 순 · 여러 업종 합치기", () => {
  it("찜 수 내림차순, 같으면 기존 순서", () => {
    const b = body([item({ id: "a" }), item({ id: "b" }), item({ id: "c" })]);
    expect(sortStoresBrowseByFavorites(b, new Map([["c", 3], ["b", 3]])).stores.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
  it("영업 상태 → 거리 밖 → 정렬 키, 중복 매장은 한 번", () => {
    const cat1 = body([item({ id: "a", distanceKm: 5 }), item({ id: "x", status: "closed", distanceKm: 1 })], ["a"]);
    const cat2 = body([item({ id: "b", distanceKm: 2 }), item({ id: "a", distanceKm: 5 }), item({ id: "o", distanceKm: 0.5, distanceOutOfRange: true })]);
    const merged = mergeStoresBrowseMenuBodies([cat1, cat2], "distance", null)!;
    expect(merged.stores.map((s) => s.id)).toEqual(["b", "a", "o", "x"]);
    expect(Object.keys(merged.meta.browseInsertion?.couponBadgeByStoreId ?? {})).toEqual(["a"]);
    expect(merged.meta.browseInsertion?.rows).toBeUndefined();
    const pop = mergeStoresBrowseMenuBodies([cat1, cat2], "popular", new Map([["a", 1], ["b", 9]]))!;
    expect(pop.stores.map((s) => s.id)).toEqual(["b", "a", "o", "x"]);
    expect(mergeStoresBrowseMenuBodies([cat1], "default", null)).toBe(cat1);
  });
});
