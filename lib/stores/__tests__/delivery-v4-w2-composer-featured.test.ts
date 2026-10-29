/**
 * v4 W2 — PL-03 OOR 허용 선반 제거 · PL-06 추천 기간 · PL-02 선반 카드 `isSampleStore`.
 */
import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import { flattenStoresHomeFoodEntries } from "@/lib/stores/stores-home-feed-sections";
import { storeHomeFeedItemToShelfEntry } from "@/lib/stores/product/stores-home-store-to-shelf-entry";
import { isStoreFeaturedActive } from "@/lib/stores/store-featured-period";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import * as oorPolicy from "@/lib/delivery/delivery-list-oor-policy";

const NOW = Date.parse("2026-10-29T12:00:00.000Z");

function item(partial: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.id,
    nameKo: partial.id,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: partial.status ?? "open",
    rating: partial.rating ?? 4.5,
    reviewCount: partial.reviewCount ?? 10,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 15,
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: 1.2,
    distanceOutOfRange: partial.distanceOutOfRange,
    featuredItems: [{ productId: `rep-${partial.id}`, name: "대표", price: 100 }],
    profileImageUrl: null,
    isFeatured: partial.isFeatured ?? false,
    isSampleStore: partial.isSampleStore,
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
    completedOrderCount30d: 0,
    firstListedAt: null,
    discoveryCampaign: partial.discoveryCampaign ?? null,
  };
}

const campaign = (id: string) => ({
  id: `c-${id}`,
  campaignType: "promo" as const,
  title: "할인",
  bodyCopy: null,
  startAt: "2026-10-01T00:00:00Z",
  endAt: "2026-11-30T00:00:00Z",
});

describe("v4 PL-03 — OOR 허용 HOME 선반 폐지", () => {
  it("HOME_DISCOVERY_SHELVES_ALLOW_OOR 상수가 없다", () => {
    expect("HOME_DISCOVERY_SHELVES_ALLOW_OOR" in oorPolicy).toBe(false);
  });

  const pool = [
    item({ id: "in", isFeatured: true, discoveryCampaign: campaign("in") }),
    item({ id: "oor", isFeatured: true, discoveryCampaign: campaign("oor"), distanceOutOfRange: true }),
  ];

  it("섹션 순서 경로: 추천(recommended)·할인/프로모션(editorial_promo) 선반에서 배달 범위 밖 실매장 제외", () => {
    // 선반마다 따로 구성 (같은 대표 상품은 다른 데이터 소스 선반에 중복 노출되지 않는 계약)
    const campaignOnly = composeStoresHomeFeed(pool, { nowMs: NOW, purposeAllocationOrder: ["campaignFood"] });
    expect(campaignOnly.campaignFood.map((e) => e.storeId)).toEqual(["in"]);
    const featuredOnly = composeStoresHomeFeed(pool, { nowMs: NOW, purposeAllocationOrder: ["slot5Food"] });
    expect(featuredOnly.slot5Food.map((e) => e.storeId)).toEqual(["in"]);
  });

  it("레거시 경로: slot5Food·campaignFood 에서도 OOR 제외", () => {
    const c = composeStoresHomeFeed(pool, { nowMs: NOW });
    expect(c.campaignFood.some((e) => e.storeId === "oor")).toBe(false);
    expect(c.slot5Food.some((e) => e.storeId === "oor")).toBe(false);
    for (const key of ["slot0Food", "slot2Food", "newStoreFood", "slot3Food", "slot4Food"] as const) {
      expect(c[key].some((e) => e.storeId === "oor")).toBe(false);
    }
    expect(c.slot6RestStores.some((s) => s.id === "oor")).toBe(false);
  });
});

describe("v4 PL-02 — 선반 카드 데이터에 isSampleStore", () => {
  it("composer 대표·캠페인 카드, legacy flatten, store→shelf 매핑 모두 채움 (생략 = false)", () => {
    const stores = [
      item({ id: "sample", isSampleStore: true, isFeatured: true, discoveryCampaign: campaign("sample") }),
      item({ id: "real", isFeatured: true }),
    ];
    const c = composeStoresHomeFeed(stores, {
      nowMs: NOW,
      purposeAllocationOrder: ["slot0Food", "campaignFood", "slot5Food"],
    });
    const all = [...c.slot0Food, ...c.campaignFood, ...c.slot5Food];
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) expect(e.isSampleStore).toBe(e.storeId === "sample");
    expect(flattenStoresHomeFoodEntries(stores).map((e) => e.isSampleStore)).toEqual([true, false]);
    expect(storeHomeFeedItemToShelfEntry(stores[0]!).isSampleStore).toBe(true);
    expect(storeHomeFeedItemToShelfEntry(stores[1]!).isSampleStore).toBe(false);
  });
});

describe("v4 PL-06 — 추천 기간 판정", () => {
  const at = (iso: string) => Date.parse(iso);
  it("is_featured=false 는 기간과 무관하게 false", () => {
    expect(isStoreFeaturedActive({ is_featured: false }, NOW)).toBe(false);
    expect(isStoreFeaturedActive({ is_featured: null }, NOW)).toBe(false);
  });
  it("기간 null = 무기한 / 컬럼 없는 행(구 payload) = 기존 판정", () => {
    expect(isStoreFeaturedActive({ is_featured: true, featured_start_at: null, featured_end_at: null }, NOW)).toBe(true);
    expect(isStoreFeaturedActive({ is_featured: true }, NOW)).toBe(true);
  });
  it("시작 전·종료 후는 추천 아님, 시작 시각 포함·종료 시각 미포함", () => {
    const row = { is_featured: true, featured_start_at: "2026-10-10T00:00:00Z", featured_end_at: "2026-10-20T00:00:00Z" };
    expect(isStoreFeaturedActive(row, at("2026-10-09T23:59:59Z"))).toBe(false);
    expect(isStoreFeaturedActive(row, at("2026-10-10T00:00:00Z"))).toBe(true);
    expect(isStoreFeaturedActive(row, at("2026-10-19T23:59:59Z"))).toBe(true);
    expect(isStoreFeaturedActive(row, at("2026-10-20T00:00:00Z"))).toBe(false);
    expect(isStoreFeaturedActive({ is_featured: true, featured_end_at: "2026-10-20T00:00:00Z" }, NOW)).toBe(false);
    expect(isStoreFeaturedActive({ is_featured: true, featured_start_at: "2026-11-01T00:00:00Z" }, NOW)).toBe(false);
  });
});
