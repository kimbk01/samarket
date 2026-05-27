import { describe, expect, it } from "vitest";
import {
  flattenStoresHomeFoodEntries,
  pickStoresHomeOpenNow,
  splitStoresHomeFeed,
} from "@/lib/stores/stores-home-feed-sections";
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
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: partial.deliveryFeeStrikePhp ?? null,
    paymentMethodsLine: "",
    distanceKm: partial.distanceKm ?? 1.2,
    featuredItems: partial.featuredItems ?? [{ productId: "p1", name: "치킨", price: 500 }],
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
  };
}

describe("pickStoresHomeOpenNow", () => {
  it("returns open delivery stores without full split", () => {
    const stores = [
      item({ id: "a", status: "open", deliveryAvailable: true }),
      item({ id: "b", status: "closed", deliveryAvailable: true }),
      item({ id: "c", status: "open", deliveryAvailable: false }),
    ];
    const open = pickStoresHomeOpenNow(stores);
    expect(open.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("splitStoresHomeFeed", () => {
  it("partitions without duplicate ids", () => {
    const stores = [
      item({ id: "a", isFeatured: true }),
      item({ id: "b", status: "open", deliveryAvailable: true }),
      item({ id: "c", deliveryFeeStrikePhp: 50 }),
      item({ id: "d", distanceKm: 0.5 }),
    ];
    const s = splitStoresHomeFeed(stores);
    const all = [...s.openNow, ...s.premium, ...s.discounted, ...s.topRated, ...s.nearby, ...s.feedRest];
    const ids = all.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("flattenStoresHomeFoodEntries", () => {
  it("maps first featured item per store", () => {
    const entries = flattenStoresHomeFoodEntries([
      item({ id: "a", featuredItems: [{ productId: "p1", name: "A", price: 100 }] }),
    ]);
    expect(entries[0]?.name).toBe("A");
  });
});
