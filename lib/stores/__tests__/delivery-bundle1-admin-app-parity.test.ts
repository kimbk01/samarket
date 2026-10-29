/**
 * 배달 묶음 1 — 어드민 설정 = 앱 (docs/audit/delivery-audit-2026-10-29.md §4-1·§4-2).
 */
import { describe, expect, it } from "vitest";
import { resolveHomeShelfProductCatalog } from "@/lib/stores/product/stores-home-shelf-product-resolve";
import { normalizeHomeShelfSaveOrder } from "@/lib/stores/product/stores-home-shelf-save-order";
import { buildHomeShelfProductRpcFields } from "@/lib/stores/product/stores-home-shelf-product-db";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import {
  resolveHomeShelfShowAllHrefForShelf,
  showAllRouteKeysForDataSource,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { resolveHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import { resolveHomeShelfFoodEntryImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import {
  applyHomeShelfDraftVisibility,
  toTelemetryFreeHomeInsertions,
} from "@/lib/stores/product/stores-home-shelf-admin-preview";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import {
  filterTaxonomyByBrowseHiddenScopeKeys,
  isBrowseScopeCustomerVisible,
} from "@/lib/stores/product/stores-browse-scope-visibility";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";

function store(id: string, extra: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: id,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "식당",
    regionLabel: "Manila",
    status: "open",
    rating: 4.5,
    reviewCount: 10,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: null,
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: 1,
    featuredItems: [{ productId: `p-${id}`, name: "메뉴", price: 100, imageUrl: `https://img/${id}.webp` }],
    profileImageUrl: `https://img/profile-${id}.webp`,
    isFeatured: false,
    commerce: {
      minOrderPhp: null,
      deliveryFeePhp: null,
      freeDeliveryOverPhp: null,
      deliveryCourierLabel: null,
      deliveryFeeMode: null,
      deliveryFeeStrikeReferencePhp: null,
      prepMinutes: 20,
      estPrepLabel: "20분",
      deliveryRideDisplayManual: null,
      paymentMethodsLegacy: null,
      paymentMethodsConfig: null,
    },
    firstListedAt: null,
    ...extra,
  } as StoreHomeFeedItem;
}

describe("H-02 선반 설정 행 1개 — 다른 선반 행을 합치지 않음", () => {
  const restRow = { shelfId: "rest_stores", slot: "slot6RestStores", enabled: true, titleKo: "더 많은 매장" };
  const legacyRow = { shelfId: "main_stores", slot: "slot1Stores", enabled: false, titleKo: "매장" };
  it("입력 순서와 무관하게 자기 슬롯 행이 이긴다", () => {
    for (const rows of [[restRow, legacyRow], [legacyRow, restRow]]) {
      const rest = resolveHomeShelfProductCatalog(rows).find((s) => s.shelfId === "rest_stores");
      expect(rest?.titleKo).toBe("더 많은 매장");
      expect(rest?.enabled).toBe(true);
    }
  });
  it("자기 행이 없을 때만 과거 별칭 행 사용", () => {
    const rest = resolveHomeShelfProductCatalog([legacyRow]).find((s) => s.shelfId === "rest_stores");
    expect(rest?.titleKo).toBe("매장");
  });
});

describe("H-03 저장 순서 정규화", () => {
  it("드래그 결과가 비선반 슬롯 순서와 겹치지 않는다", () => {
    const rows = normalizeHomeShelfSaveOrder(
      [
        { shelfId: "new_store", enabled: true, order: 0, max: 20 },
        { shelfId: "order_now", enabled: true, order: 1, max: 16 },
      ],
      [
        { slot: "slot1Stores", contentType: "store", enabled: true, order: 1, max: null },
        { slot: "homeBannerBeforeRest", contentType: "ad", enabled: true, order: 9, max: 1 },
      ]
    );
    const orders = rows.map((r) => r.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(rows.map((r) => r.slot)).toEqual(["newStoreFood", "slot0Food", "slot1Stores", "homeBannerBeforeRest"]);
  });
});

describe("H-04 선반 상품 필드 = CAS RPC product", () => {
  it("shelf_id 와 필드를 RPC 형식으로 만든다", () => {
    const built = buildHomeShelfProductRpcFields({ shelfId: "order_now", titleKo: "지금", subtitleKo: "" });
    expect(built?.slot).toBe("slot0Food");
    expect(built?.product).toMatchObject({ shelf_id: "order_now", title_ko: "지금", subtitle_ko: "" });
  });
});

describe("H-06·H-07 최대 개수 빈칸 = 무제한, 빈 부제 = 부제 없음", () => {
  it("max null 이면 기본 상한(16)을 넘어 배정", () => {
    const stores = Array.from({ length: 20 }, (_, i) => store(`s${i}`));
    const composed = composeStoresHomeFeed(stores, {
      purposeAllocationOrder: ["slot0Food"],
      slotDataSources: { slot0Food: "order_now" },
      slotMax: { slot0Food: null },
    });
    expect(composed.slot0Food.length).toBe(20);
  });
  it("빈 문자열 부제는 기본 부제를 쓰지 않는다", () => {
    const orderNow = resolveHomeShelfProductCatalog([{ shelfId: "order_now", subtitleKo: "" }]).find(
      (s) => s.shelfId === "order_now"
    );
    expect(orderNow?.subtitleKo).toBeNull();
    const untouched = resolveHomeShelfProductCatalog([]).find((s) => s.shelfId === "order_now");
    expect(untouched?.subtitleKo).toBeTruthy();
  });
});

describe("H-08 상품형 선반 이미지 소스 = 매장 프로필", () => {
  it("store_profile 선택 시 매장 프로필 이미지", () => {
    const img = resolveHomeShelfFoodEntryImage(
      {
        storeId: "a",
        storeSlug: "a",
        storeName: "a",
        productId: "p",
        name: "m",
        price: 1,
        imageUrl: "https://img/product.webp",
        storeProfileImageUrl: "https://img/profile.webp",
        etaLabel: null,
        rating: 4,
      },
      undefined,
      "store_profile"
    );
    expect(img.imageUrl).toBe("https://img/profile.webp");
  });
});

describe("H-14 쿠폰 연동 혜택 문구", () => {
  it("혜택 문구 모드가 delivery_discount 여도 쿠폰 문구", () => {
    const benefit = resolveHomeShelfCardBenefit({
      storeId: "a",
      couponIntegration: "benefit_line",
      adIntegration: "off",
      badgeMode: "standard",
      benefitLineMode: "delivery_discount",
      maps: {
        adsByStoreId: new Map(),
        couponsByStoreId: new Map([
          ["a", { id: "c", storeId: "a", title: "t", discountType: "fixed", discountValue: 50, minOrderAmount: null, termsCopy: null }],
        ]),
      } as never,
      labels: {
        sponsored: "광고",
        coupon: "쿠폰",
        couponDiscount: (d) => `${d} 할인`,
        couponMinOrder: (a) => `${a} 이상`,
        adHeadline: (h) => h,
      },
    });
    expect(benefit?.benefitLine).toContain("할인");
  });
});

describe("H-15 전체 보기 = 데이터 소스와 같은 목록", () => {
  it("소스에 맞는 목록이 없으면 링크 없음, 저장 경로가 틀리면 소스 기준", () => {
    expect(showAllRouteKeysForDataSource("new_store")).toEqual([]);
    expect(
      resolveHomeShelfShowAllHrefForShelf({
        dataSource: "new_store",
        productConfig: { showAllEnabled: true, showAllRouteKey: "orderNow" },
      })
    ).toBeNull();
    const href = resolveHomeShelfShowAllHrefForShelf({
      dataSource: "high_rating",
      productConfig: { showAllEnabled: true, showAllRouteKey: "orderNow" },
    });
    expect(href).toContain("sort=rating");
  });
});

describe("H-11 미리보기 — 초안 기간·광고 집계 없음", () => {
  it("초안 기간이 지났으면 고객 노출 아님", () => {
    const shelf = resolveHomeShelfProductCatalog([]).find((s) => s.shelfId === "order_now")!;
    const past = applyHomeShelfDraftVisibility(
      { ...shelf, scheduleStart: "2020-01-01T00:00:00.000Z", scheduleEnd: "2020-01-02T00:00:00.000Z" },
      Date.parse("2026-10-29T00:00:00Z")
    );
    expect(past.customerVisible).toBe(false);
  });
  it("노출 토큰 행을 제거한다", () => {
    const meta = {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["a"],
        rows: [
          { kind: "organic", storeId: "a" },
          { kind: "paid_ad", campaignId: "c", storeId: "b", exposureToken: "tok" },
        ],
        adCount: 1,
        sponsoredStoreIds: ["b"],
        surfaceAllowed: true,
      },
    } as unknown as StoresHomeInsertionMeta;
    const out = toTelemetryFreeHomeInsertions(meta)!;
    expect(out.restInsertion.rows).toEqual([{ kind: "organic", storeId: "a" }]);
    expect(out.restInsertion.sponsoredStoreIds).toEqual([]);
  });
});

describe("P-01·P-02 업종 탭·칩 숨김·표시명", () => {
  const taxonomy = {
    categories: [
      { id: "c1", name: "식당", slug: "restaurant", sort_order: 1 },
      { id: "c2", name: "카페", slug: "cafe", sort_order: 2 },
    ],
    topics: [
      { id: "t1", store_category_id: "c1", name: "치킨", slug: "chicken", sort_order: 1 },
      { id: "t2", store_category_id: "c1", name: "피자", slug: "pizza", sort_order: 2 },
      { id: "t3", store_category_id: "c2", name: "커피", slug: "coffee", sort_order: 1 },
    ],
  };
  it("1차 OFF 는 그 2차까지, 2차 OFF 는 그 칩만 숨긴다", () => {
    const out = filterTaxonomyByBrowseHiddenScopeKeys(taxonomy, ["cafe", "restaurant/pizza"]);
    expect(out.categories.map((c) => c.slug)).toEqual(["restaurant"]);
    expect(out.topics.map((t) => t.slug)).toEqual(["chicken"]);
  });
  it("표시명을 적용한다", () => {
    const out = filterTaxonomyByBrowseHiddenScopeKeys(taxonomy, [], { restaurant: { ko: "맛집", en: null } });
    expect(out.categories[0]?.name).toBe("맛집");
  });
});

describe("P-03·P-04 2차 빈 값 = 1차 상속", () => {
  const base = {
    enabled: true,
    displayTitleKo: null,
    displayTitleEn: null,
    adEnabled: "inherit" as const,
    couponEnabled: "inherit" as const,
    presentationMode: "inherit" as const,
    intervalEveryN: "inherit" as const,
    productConfig: null,
  };
  it("1차 기간이 끝나면 별도 설정 2차도 닫힌다", () => {
    const resolved = resolveBrowseScopePolicy({
      primarySlug: "restaurant",
      subSlug: "pizza",
      primaryRow: {
        ...base,
        scopeKey: "restaurant",
        maxInsertion: 2,
        scheduleStart: "2020-01-01T00:00:00.000Z",
        scheduleEnd: "2020-01-02T00:00:00.000Z",
      } as never,
      subRow: {
        ...base,
        scopeKey: "restaurant/pizza",
        displayTitleKo: "피자",
        maxInsertion: null,
        scheduleStart: null,
        scheduleEnd: null,
      } as never,
    });
    expect(resolved.scheduleEnd).toBe("2020-01-02T00:00:00.000Z");
    expect(resolved.maxInsertion).toBe(2);
    expect(isBrowseScopeCustomerVisible(resolved, Date.parse("2026-10-29T00:00:00Z"))).toBe(false);
  });
});
