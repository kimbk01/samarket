import { describe, expect, it } from "vitest";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
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
  };
}

describe("composeStoresHomeFeed — P1-B2 Slot2 platform popular", () => {
  it("T2: platform product rank1 active → Slot2 uses platform product", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        completedOrderCount30d: 20,
        featuredItems: [{ productId: "rep-a", name: "대표", price: 100 }],
        platformPopularProducts: [
          {
            productId: "pop-a",
            name: "인기치킨",
            price: 900,
            imageUrl: null,
            totalQty: 50,
            popularRank: 1,
            windowDays: 30,
          },
        ],
      }),
    ]);
    expect(composition.slot2Food[0]?.productId).toBe("pop-a");
    expect(composition.slot2Food[0]?.menuAuthority).toBe("platform_popular");
  });

  it("T3: rank1 inactive / rank2 active → Slot2 uses rank2 platform product", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        platformPopularProducts: [
          {
            productId: "pop2",
            name: "두번째",
            price: 800,
            imageUrl: null,
            totalQty: 10,
            popularRank: 2,
            windowDays: 30,
          },
        ],
      }),
    ]);
    expect(composition.slot2Food[0]?.productId).toBe("pop2");
    expect(composition.slot2Food[0]?.menuAuthority).toBe("platform_popular");
  });

  it("T4/T5: no platform popular → representative fallback", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "closed", // not Slot0 — representative still available for Slot2
        completedOrderCount30d: 20,
        platformPopularProducts: [],
        featuredItems: [{ productId: "rep-a", name: "대표", price: 100 }],
      }),
    ]);
    expect(composition.slot2Food[0]?.productId).toBe("rep-a");
    expect(composition.slot2Food[0]?.menuAuthority).toBe("owner_representative");
  });

  it("T7/T8: menuAuthority separation", () => {
    const withPlatform = composeStoresHomeFeed([
      item({
        id: "a",
        platformPopularProducts: [
          {
            productId: "pop",
            name: "P",
            price: 1,
            imageUrl: null,
            totalQty: 5,
            popularRank: 1,
            windowDays: 30,
          },
        ],
      }),
    ]);
    expect(withPlatform.slot2Food[0]?.menuAuthority).toBe("platform_popular");

    const fallback = composeStoresHomeFeed([
      item({ id: "b", status: "closed", completedOrderCount30d: 20, platformPopularProducts: [] }),
    ]);
    expect(fallback.slot2Food[0]?.menuAuthority).toBe("owner_representative");
  });

  it("T11: Slot0 still owner representative product", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        platformPopularProducts: [
          {
            productId: "pop",
            name: "인기",
            price: 900,
            imageUrl: null,
            totalQty: 99,
            popularRank: 1,
            windowDays: 30,
          },
        ],
        featuredItems: [{ productId: "rep", name: "대표", price: 100 }],
      }),
    ]);
    expect(composition.slot0Food[0]?.productId).toBe("rep");
    expect(composition.slot0Food[0]?.menuAuthority).toBe("owner_representative");
  });

  it("T10: Slot2 store ordering unchanged (completedOrderCount30d)", () => {
    const stores = Array.from({ length: 10 }, (_, i) =>
      item({
        id: `s${i}`,
        completedOrderCount30d: 100 - i,
      })
    );
    const composition = composeStoresHomeFeed(stores);
    const counts = composition.slot2Food.map((e) => {
      const s = stores.find((x) => x.id === e.storeId)!;
      return s.completedOrderCount30d ?? 0;
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});
