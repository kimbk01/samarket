import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import { STORE_HOME_FEED_RESPONSE_MAX } from "@/lib/stores/store-discovery-candidate";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

/** Same shape as p1-b2 fixture — field names must match StoreHomeFeedItem. */
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
    etaLabel: partial.etaLabel ?? "약 25~35분",
    deliveryFeeLabel: partial.deliveryFeeLabel ?? null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: partial.distanceKm ?? 1.2,
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
    completedOrderCount30d: partial.completedOrderCount30d ?? 10,
    discoveryEligibilityRank: partial.discoveryEligibilityRank ?? 0,
    firstListedAt: partial.firstListedAt ?? null,
    discoveryCampaign: partial.discoveryCampaign,
  };
}

function richStore(i: number): StoreHomeFeedItem {
  return item({
    id: `s${i}`,
    status: "open",
    deliveryAvailable: true,
    completedOrderCount30d: 100 - i,
    discoveryEligibilityRank: 0,
    deliveryFeeStrikePhp: i % 5 === 0 ? 30 : null,
    rating: 4.5,
    reviewCount: 10,
    isFeatured: i % 7 === 0,
    distanceKm: 0.5 + i * 0.01,
  });
}

function allFoodProductIds(composition: ReturnType<typeof composeStoresHomeFeed>): string[] {
  return [
    ...composition.slot0Food,
    ...composition.slot2Food,
    ...composition.newStoreFood,
    ...composition.campaignFood,
    ...composition.slot3Food,
    ...composition.slot4Food,
    ...composition.slot5Food,
  ].map((e) => e.productId);
}

describe("composeStoresHomeFeed — Invariant C product dedupe", () => {
  it("T1: Slot0 product P1 → Slot4 same P1 not re-exposed", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 50,
        featuredItems: [{ productId: "P1", name: "김밥", price: 100 }],
        rating: 4.8,
        reviewCount: 20,
      }),
      item({
        id: "b",
        status: "closed",
        completedOrderCount30d: 40,
        featuredItems: [{ productId: "P2", name: "다른메뉴", price: 200 }],
        rating: 4.7,
        reviewCount: 15,
      }),
    ]);

    expect(composition.slot0Food.map((e) => e.productId)).toContain("P1");
    expect(composition.slot4Food.map((e) => e.productId)).not.toContain("P1");
  });

  it("T2: same store + different product P2 allowed on later shelf", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 80,
        featuredItems: [{ productId: "P1", name: "대표김밥", price: 100 }],
        platformPopularProducts: [
          {
            productId: "P2",
            name: "인기김치김밥",
            price: 120,
            imageUrl: null,
            totalQty: 99,
            popularRank: 1,
            windowDays: 30,
          },
        ],
        rating: 4.8,
        reviewCount: 20,
      }),
      item({
        id: "b",
        status: "closed",
        completedOrderCount30d: 10,
        featuredItems: [{ productId: "Pb", name: "B", price: 50 }],
      }),
    ]);

    expect(composition.slot0Food[0]?.productId).toBe("P1");
    expect(composition.slot2Food.some((e) => e.storeId === "a" && e.productId === "P2")).toBe(true);
  });

  it("T3: Slot0 product ≠ Slot2 platform popular → Slot2 kept", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 90,
        featuredItems: [{ productId: "rep-a", name: "대표", price: 100 }],
        platformPopularProducts: [
          {
            productId: "pop-a",
            name: "인기",
            price: 900,
            imageUrl: null,
            totalQty: 50,
            popularRank: 1,
            windowDays: 30,
          },
        ],
      }),
    ]);

    expect(composition.slot0Food[0]?.productId).toBe("rep-a");
    expect(composition.slot2Food[0]?.productId).toBe("pop-a");
    expect(composition.slot2Food[0]?.menuAuthority).toBe("platform_popular");
  });

  it("T4: Slot3/4/5 skip products already registered on prior food shelves", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 70,
        deliveryFeeStrikePhp: 30,
        featuredItems: [{ productId: "SAME", name: "동일메뉴", price: 100 }],
        rating: 4.9,
        reviewCount: 30,
        isFeatured: true,
      }),
      item({
        id: "b",
        status: "closed",
        completedOrderCount30d: 60,
        deliveryFeeStrikePhp: 25,
        featuredItems: [{ productId: "OTHER", name: "다른메뉴", price: 200 }],
        rating: 4.8,
        reviewCount: 25,
        isFeatured: true,
      }),
    ]);

    expect(composition.slot0Food.map((e) => e.productId)).toContain("SAME");
    for (const shelf of [composition.slot3Food, composition.slot4Food, composition.slot5Food]) {
      expect(shelf.map((e) => e.productId)).not.toContain("SAME");
    }
  });

  it("T5: candidate shortage → shelf shrink, no fake fill", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "only",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 10,
        deliveryFeeStrikePhp: 30,
        featuredItems: [{ productId: "ONLY-P", name: "유일메뉴", price: 100 }],
        rating: 4.5,
        reviewCount: 10,
        isFeatured: true,
      }),
    ]);

    expect(composition.slot0Food).toHaveLength(1);
    expect(composition.slot0Food[0]?.productId).toBe("ONLY-P");
    expect(composition.slot3Food).toEqual([]);
    expect(composition.slot4Food).toEqual([]);
    expect(composition.slot5Food).toEqual([]);
  });

  it("T6: store-level horizontal overlap still allowed when products differ", () => {
    const stores = Array.from({ length: 20 }, (_, i) =>
      item({
        id: `s${i}`,
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100 - i,
        discoveryEligibilityRank: 0,
        deliveryFeeStrikePhp: 30,
        rating: 4.5,
        reviewCount: 10,
        isFeatured: i % 7 === 0,
        distanceKm: 0.5 + i * 0.01,
        featuredItems: [{ productId: `rep-${i}`, name: "대표", price: 100 }],
        platformPopularProducts: [
          {
            productId: `pop-${i}`,
            name: "인기",
            price: 200,
            imageUrl: null,
            totalQty: 50 - i,
            popularRank: 1,
            windowDays: 30,
          },
        ],
      })
    );
    const composition = composeStoresHomeFeed(stores);
    const slot2Ids = new Set(composition.slot2Food.map((e) => e.storeId));
    const storeOverlap = composition.slot3Food.filter((e) => slot2Ids.has(e.storeId));
    expect(storeOverlap.length).toBeGreaterThan(0);
  });

  it("T7: Slot0 ∩ rest_stores store dedupe; slot1Stores empty (CUT2)", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "a", status: "open", deliveryAvailable: true }),
      item({ id: "b", status: "closed" }),
      item({ id: "c", status: "closed" }),
    ]);
    const slot0Ids = new Set(composition.slot0Food.map((e) => e.storeId));
    expect(composition.slot1Stores).toEqual([]);
    expect(composition.slot6RestStores.every((s) => !slot0Ids.has(s.id))).toBe(true);
  });

  it("T8: food-card product uniqueness across HOME food shelves (dense smoke)", () => {
    const stores = Array.from({ length: STORE_HOME_FEED_RESPONSE_MAX }, (_, i) => richStore(i));
    const composition = composeStoresHomeFeed(stores);
    const ids = allFoodProductIds(composition);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
