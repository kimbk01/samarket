import { describe, expect, it } from "vitest";
import type { AutoBusinessHoursConfig } from "@/lib/stores/store-auto-hours";
import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";
import {
  formatCartLineOptionLines,
  isStoreMenuRootHref,
  pickCartUpsellProducts,
  pickStoreProductMenuSeed,
  resolveProductDetailReturnAction,
  resolveStoreClosingSoon,
} from "@/lib/stores/store-menu-detail-cart-baemin-presentation";

/** Asia/Manila = UTC+8 (서머타임 없음) — 매장 현지 시각 HH:mm 를 UTC Date 로 */
function manila(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00+08:00`);
}

function cfg(open: string, close: string, extra?: Partial<AutoBusinessHoursConfig>): AutoBusinessHoursConfig {
  return { enabled: true, timezone: "Asia/Manila", open, close, weekly: null, closedDates: [], ...extra };
}

describe("WP8 — resolveStoreClosingSoon (마감임박)", () => {
  it("종료 60분 이내면 종료 시각·남은 분", () => {
    expect(resolveStoreClosingSoon(cfg("10:00", "22:30"), manila("2026-10-30", "21:45"))).toEqual({
      closeHHmm: "22:30",
      minutesLeft: 45,
    });
    expect(resolveStoreClosingSoon(cfg("10:00", "22:30"), manila("2026-10-30", "21:30"))?.minutesLeft).toBe(60);
  });

  it("60분보다 많이 남았거나 영업 시간 밖이면 null", () => {
    expect(resolveStoreClosingSoon(cfg("10:00", "22:30"), manila("2026-10-30", "21:29"))).toBeNull();
    expect(resolveStoreClosingSoon(cfg("10:00", "22:30"), manila("2026-10-30", "22:30"))).toBeNull();
    expect(resolveStoreClosingSoon(cfg("10:00", "22:30"), manila("2026-10-30", "09:30"))).toBeNull();
  });

  it("자정 넘김 구간 — 오늘 시작 부분·전날 꼬리 모두 처리", () => {
    // 18:00–01:00: 23:30 → 90분 남음 (null), 00:20 → 전날 구간 꼬리 40분
    expect(resolveStoreClosingSoon(cfg("18:00", "01:00"), manila("2026-10-30", "23:30"))).toBeNull();
    expect(resolveStoreClosingSoon(cfg("18:00", "01:00"), manila("2026-10-30", "00:20"))).toEqual({
      closeHHmm: "01:00",
      minutesLeft: 40,
    });
    expect(resolveStoreClosingSoon(cfg("18:00", "00:30"), manila("2026-10-30", "23:45"))).toEqual({
      closeHHmm: "00:30",
      minutesLeft: 45,
    });
  });

  it("휴무일·설정 없음이면 null", () => {
    expect(
      resolveStoreClosingSoon(cfg("10:00", "22:30", { closedDates: ["2026-10-30"] }), manila("2026-10-30", "22:00"))
    ).toBeNull();
    expect(resolveStoreClosingSoon(null, manila("2026-10-30", "22:00"))).toBeNull();
  });
});

describe("WP8 — formatCartLineOptionLines (옵션 줄)", () => {
  it("그룹마다 「그룹 : 값 (+가격)」 한 줄", () => {
    expect(formatCartLineOptionLines("가격: 곱빼기 (+₱20) · 추가: 콜라 (+₱30), 사이다")).toEqual([
      "가격 : 곱빼기 (+₱20)",
      "추가 : 콜라 (+₱30), 사이다",
    ]);
  });
  it("빈 요약은 [] · 콜론 없는 레거시 요약은 그대로", () => {
    expect(formatCartLineOptionLines("")).toEqual([]);
    expect(formatCartLineOptionLines(null)).toEqual([]);
    expect(formatCartLineOptionLines("매운맛")).toEqual(["매운맛"]);
  });
});

describe("WP7 — 담은 뒤 돌아가기 (back vs replace)", () => {
  it("이 매장 메뉴 화면 판정 — 쿼리 무관·인코딩 무관·하위 경로 제외", () => {
    expect(isStoreMenuRootHref("/stores/so-dam", "so-dam")).toBe(true);
    expect(isStoreMenuRootHref("/stores/so-dam?focusProduct=1", "so-dam")).toBe(true);
    expect(isStoreMenuRootHref("/stores/%EC%86%8C%EB%8B%B4/", "소담")).toBe(true);
    expect(isStoreMenuRootHref("/stores/so-dam/p/1", "so-dam")).toBe(false);
    expect(isStoreMenuRootHref("/stores/other", "so-dam")).toBe(false);
    expect(isStoreMenuRootHref(null, "so-dam")).toBe(false);
  });

  it("Navigation API: 바로 앞이 매장이면 back, 아니면 replace", () => {
    const base = { storeSlug: "so-dam", hasNavigationApi: true, historyIncludesStoreParent: false };
    expect(resolveProductDetailReturnAction({ ...base, previousHref: "/stores/so-dam" })).toBe("back");
    expect(resolveProductDetailReturnAction({ ...base, previousHref: "/stores/m/food" })).toBe("replace");
    expect(resolveProductDetailReturnAction({ ...base, previousHref: null })).toBe("replace");
  });

  it("Navigation API 없음: 진입 기록(store parent)이 있을 때만 back", () => {
    const base = { storeSlug: "so-dam", hasNavigationApi: false, previousHref: null };
    expect(resolveProductDetailReturnAction({ ...base, historyIncludesStoreParent: true })).toBe("back");
    expect(resolveProductDetailReturnAction({ ...base, historyIncludesStoreParent: false })).toBe("replace");
  });
});

function card(id: string, status = "active"): StoreDetailProductCard {
  return {
    id,
    title: id,
    summary: null,
    price: 100,
    discount_price: null,
    discount_percent: null,
    track_inventory: false,
    stock_qty: 0,
    thumbnail_url: null,
    pickup_available: null,
    local_delivery_available: null,
    shipping_available: null,
    is_featured: false,
    is_owner_recommended: false,
    is_representative: false,
    item_type: null,
    categoryName: null,
    menu_section_id: null,
    menuSectionSort: 0,
    sort_order: 0,
    has_options: false,
    min_order_qty: 1,
    max_order_qty: 99,
    product_status: status,
  };
}

describe("WP8 — pickCartUpsellProducts (함께 먹으면 좋아요)", () => {
  it("인기 → 추천 순, 담은 메뉴·품절·중복 제외", () => {
    const out = pickCartUpsellProducts({
      cards: [card("a"), card("b"), card("c", "sold_out"), card("d"), card("e")],
      popularProductIds: ["b", "c", "a"],
      recommendedProductIds: ["a", "e", "zz"],
      excludeProductIds: ["a"],
    });
    expect(out.map((c) => c.id)).toEqual(["b", "e"]);
  });
  it("순서 정보가 없으면 [] (임의 순서 금지)", () => {
    expect(
      pickCartUpsellProducts({
        cards: [card("a")],
        popularProductIds: [],
        recommendedProductIds: undefined,
        excludeProductIds: [],
      })
    ).toEqual([]);
  });
});

describe("WP7 — pickStoreProductMenuSeed (매장 목록 캐시로 먼저 그리기)", () => {
  const json = {
    ok: true,
    products: [
      { id: "p1", title: "짜장면", price: 150, discount_price: 120, thumbnail_url: "https://x/a.jpg", summary: " 춘장 " },
      { id: "p2", title: "", price: 100 },
    ],
  };
  it("id 로 이름·가격·할인가·사진", () => {
    expect(pickStoreProductMenuSeed(json, "p1")).toEqual({
      id: "p1",
      title: "짜장면",
      summary: "춘장",
      price: 150,
      discountPrice: 120,
      thumbnailUrl: "https://x/a.jpg",
    });
  });
  it("없거나 이름·가격이 비면 null", () => {
    expect(pickStoreProductMenuSeed(json, "p2")).toBeNull();
    expect(pickStoreProductMenuSeed(json, "nope")).toBeNull();
    expect(pickStoreProductMenuSeed(null, "p1")).toBeNull();
  });
});
