import { describe, expect, it } from "vitest";
import {
  composeStoresHomeFeed,
  STORES_HOME_POPULAR_SHELF_MAX,
} from "@/lib/stores/stores-home-composer";
import { STORE_HOME_FEED_RESPONSE_MAX } from "@/lib/stores/store-discovery-candidate";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function platformPopular(productId: string, name = "인기메뉴", price = 600) {
  return [
    {
      productId,
      name,
      price,
      imageUrl: null as string | null,
      totalQty: 50,
      popularRank: 1,
      windowDays: 30,
    },
  ];
}

function item(partial: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    id: partial.id,
    slug: partial.slug ?? partial.id,
    nameKo: partial.nameKo ?? "매장",
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
    regionLabel: "Manila",
    status: partial.status ?? "open",
    rating: partial.rating ?? 0,
    reviewCount: partial.reviewCount ?? 0,
    deliveryAvailable: partial.deliveryAvailable ?? true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: null,
    etaLabel: "약 20~40분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: partial.distanceKm ?? null,
    featuredItems: partial.featuredItems ?? [
      { productId: `rep-${partial.id}`, name: "대표", price: 500 },
    ],
    platformPopularProducts: partial.platformPopularProducts,
    profileImageUrl: null,
    isFeatured: partial.isFeatured ?? false,
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
    completedOrderCount30d: partial.completedOrderCount30d,
    discoveryEligibilityRank: partial.discoveryEligibilityRank,
  };
}

describe("stores-home-feed popular section (CUT3 composer)", () => {
  it("orders 0 → popular shelf hidden", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "a", completedOrderCount30d: 0 }),
      item({ id: "b", completedOrderCount30d: 0 }),
    ]);
    expect(composition.slot2Food).toEqual([]);
  });

  it("slot2 populated even when stores already in Slot0 — distinct product, not excluded", () => {
    // Invariant C: same productId cannot reappear after Slot0. Slot2 uses platform popular.
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular("pop-a"),
      }),
      item({
        id: "b",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 80,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular("pop-b"),
      }),
      item({
        id: "c",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 20,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular("pop-c"),
      }),
    ]);
    expect(composition.slot0Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
    expect(composition.slot2Food.length).toBe(3);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
    expect(composition.slot2Food.map((e) => e.productId)).toEqual(["pop-a", "pop-b", "pop-c"]);
  });

  it("same representative product after Slot0 is not re-filled into Slot2", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100,
        discoveryEligibilityRank: 0,
        featuredItems: [{ productId: "ONLY", name: "단일메뉴", price: 500 }],
        // no platformPopularProducts → Slot2 would fall back to ONLY (already registered)
      }),
    ]);
    expect(composition.slot0Food.map((e) => e.productId)).toEqual(["ONLY"]);
    expect(composition.slot2Food).toEqual([]);
  });

  it("48-store fixture — popular shelf not starved by Slot0/1", () => {
    const stores = Array.from({ length: STORE_HOME_FEED_RESPONSE_MAX }, (_, i) =>
      item({
        id: `s${i}`,
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100 - i,
        discoveryEligibilityRank: 0,
        deliveryFeeStrikePhp: i % 5 === 0 ? 20 : null,
        rating: 4.5,
        reviewCount: 10,
        platformPopularProducts: platformPopular(`pop-s${i}`),
      })
    );
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(STORES_HOME_POPULAR_SHELF_MAX);
  });

  it("popular_menu metric order — higher completed orders lead (CUT2; not open-band invent)", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "open-low",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 10,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular("pop-open-low"),
      }),
      item({
        id: "closed-high",
        status: "closed",
        completedOrderCount30d: 500,
        discoveryEligibilityRank: 5,
        platformPopularProducts: platformPopular("pop-closed-high"),
      }),
    ]);
    // Slot0 adjacent-avoid may rotate open-low off first; metric still places closed-high ahead of open-low when both qualify.
    expect(composition.slot2Food.map((e) => e.storeId)[0]).toBe("closed-high");
    expect(composition.slot2Food.map((e) => e.storeId)).toContain("open-low");
  });

  it("popular shelf includes open+closed candidates without fake fill", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 30,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular("pop-a"),
      }),
      item({
        id: "closed-only",
        status: "closed",
        completedOrderCount30d: 500,
        discoveryEligibilityRank: 5,
        platformPopularProducts: platformPopular("pop-closed"),
      }),
    ]);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["closed-only", "a"]);
  });

  it("caps popular shelf without duplicate fill", () => {
    const stores = Array.from({ length: 30 }, (_, i) =>
      item({
        id: `s${i}`,
        completedOrderCount30d: 100 - i,
        discoveryEligibilityRank: 0,
        platformPopularProducts: platformPopular(`pop-s${i}`),
      })
    );
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(STORES_HOME_POPULAR_SHELF_MAX);
    const ids = composition.slot2Food.map((e) => e.storeId);
    expect(new Set(ids).size).toBe(ids.length);
    const productIds = composition.slot2Food.map((e) => e.productId);
    expect(new Set(productIds).size).toBe(productIds.length);
  });
});
