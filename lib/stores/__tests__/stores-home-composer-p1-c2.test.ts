import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const NOW = Date.parse("2026-08-23T12:00:00.000Z");

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
    rating: partial.rating ?? 4.5,
    reviewCount: partial.reviewCount ?? 10,
    deliveryAvailable: partial.deliveryAvailable ?? true,
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
    featuredItems: partial.featuredItems ?? [
      { productId: `rep-${partial.id}`, name: "대표메뉴", price: 500 },
    ],
    platformPopularProducts: partial.platformPopularProducts,
    profileImageUrl: null,
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
    completedOrderCount30d: partial.completedOrderCount30d ?? 0,
    discoveryEligibilityRank: partial.discoveryEligibilityRank,
    firstListedAt: partial.firstListedAt,
  };
}

describe("composeStoresHomeFeed — P1-C2 newStoreFood", () => {
  it("excludes NULL firstListedAt (legacy visible)", () => {
    const composition = composeStoresHomeFeed(
      [
        item({ id: "legacy", firstListedAt: null, completedOrderCount30d: 5 }),
        item({
          id: "fresh",
          firstListedAt: new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      { nowMs: NOW }
    );
    expect(composition.newStoreFood.map((e) => e.storeId)).toEqual(["fresh"]);
  });

  it("orders by first_listed_at DESC", () => {
    const older = new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    const composition = composeStoresHomeFeed(
      [item({ id: "old", firstListedAt: older }), item({ id: "new", firstListedAt: newer })],
      { nowMs: NOW }
    );
    expect(composition.newStoreFood.map((e) => e.storeId)).toEqual(["new", "old"]);
  });

  it("excludes stores outside 30d window", () => {
    const stale = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();
    const composition = composeStoresHomeFeed(
      [item({ id: "stale", firstListedAt: stale })],
      { nowMs: NOW }
    );
    expect(composition.newStoreFood).toEqual([]);
  });

  it("uses owner representative product — never platform popular", () => {
    const listed = new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString();
    const composition = composeStoresHomeFeed(
      [
        item({
          id: "n1",
          firstListedAt: listed,
          featuredItems: [{ productId: "owner-1", name: "오너추천", price: 100 }],
          platformPopularProducts: [
            {
              productId: "pop-1",
              name: "플랫폼인기",
              price: 200,
              imageUrl: null,
              totalQty: 99,
              popularRank: 1,
              windowDays: 30,
            },
          ],
        }),
      ],
      { nowMs: NOW }
    );
    expect(composition.newStoreFood).toHaveLength(1);
    expect(composition.newStoreFood[0]?.productId).toBe("owner-1");
    expect(composition.newStoreFood[0]?.menuAuthority).toBe("owner_representative");
  });

  it("does not renumber Slot0–6 fields", () => {
    const composition = composeStoresHomeFeed([item({ id: "a", completedOrderCount30d: 3 })], {
      nowMs: NOW,
    });
    expect(composition).toEqual(
      expect.objectContaining({
        slot0Food: expect.any(Array),
        slot1Stores: expect.any(Array),
        slot2Food: expect.any(Array),
        newStoreFood: expect.any(Array),
        slot3Food: expect.any(Array),
        slot4Food: expect.any(Array),
        slot5Food: expect.any(Array),
        slot6NearbyStores: expect.any(Array),
        slot6RestStores: expect.any(Array),
      })
    );
  });
});
