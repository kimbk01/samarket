import { describe, expect, it } from "vitest";
import {
  composeStoresHomeFeed,
  STORES_HOME_POPULAR_SHELF_MAX,
} from "@/lib/stores/stores-home-composer";
import { STORE_HOME_FEED_RESPONSE_MAX } from "@/lib/stores/store-discovery-candidate";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

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
      { productId: `p-${partial.id}`, name: "메뉴", price: 500 },
    ],
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

  it("slot2 populated even when stores already in Slot0 — deprioritized not excluded", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "b",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 80,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "c",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 20,
        discoveryEligibilityRank: 0,
      }),
    ]);
    expect(composition.slot0Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
    expect(composition.slot2Food.length).toBe(3);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["a", "b", "c"]);
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
      })
    );
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(STORES_HOME_POPULAR_SHELF_MAX);
  });

  it("open-band ranks above closed within popular metric ordering", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "open-low",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 10,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "closed-high",
        status: "closed",
        completedOrderCount30d: 500,
        discoveryEligibilityRank: 5,
      }),
    ]);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["open-low", "closed-high"]);
  });

  it("no overlap backfill from closed-only when open candidates exist", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 30,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "closed-only",
        status: "closed",
        completedOrderCount30d: 500,
        discoveryEligibilityRank: 5,
      }),
    ]);
    expect(composition.slot2Food.map((e) => e.storeId)).toEqual(["a", "closed-only"]);
  });

  it("caps popular shelf without duplicate fill", () => {
    const stores = Array.from({ length: 30 }, (_, i) =>
      item({
        id: `s${i}`,
        completedOrderCount30d: 100 - i,
        discoveryEligibilityRank: 0,
      })
    );
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(STORES_HOME_POPULAR_SHELF_MAX);
    const ids = composition.slot2Food.map((e) => e.storeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
