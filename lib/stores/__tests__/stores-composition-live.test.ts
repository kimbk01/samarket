import { describe, expect, it } from "vitest";
import { composeLiveHomeFeed } from "@/lib/stores/composition/stores-composition-live";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import { homeCompositionSlotItemIds } from "@/lib/stores/composition/stores-composition-home-slots";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function feedItem(id: string, partial: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: `매장-${id}`,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: "음식",
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
    etaLabel: "약 25~35분",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: 1.2,
    featuredItems: [{ productId: `p-${id}`, name: "치킨", price: 500 }],
    platformPopularProducts: undefined,
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
    completedOrderCount30d: 5,
    discoveryEligibilityRank: 0,
    firstListedAt: null,
    ...partial,
  };
}

describe("stores-composition-live — C8", () => {
  const stores = Array.from({ length: 12 }, (_, i) => feedItem(`s${i}`));

  it("default policy matches production composer output", () => {
    const production = composeStoresHomeFeed(stores);
    const live = composeLiveHomeFeed(stores, {
      rows: resolveDefaultCompositionPolicy("home"),
      overrideCount: 0,
      rejectedOverrideSlots: [],
      engine: "live",
    });
    for (const slot of Object.keys(production) as Array<keyof typeof production>) {
      expect(homeCompositionSlotItemIds(slot, live[slot])).toEqual(
        homeCompositionSlotItemIds(slot, production[slot])
      );
    }
  });

  it("null policy meta falls back to default (production parity)", () => {
    const production = composeStoresHomeFeed(stores);
    const live = composeLiveHomeFeed(stores, null);
    expect(live.slot0Food.length).toBe(production.slot0Food.length);
  });

  it("admin max cap applies on live path preserving prefix order", () => {
    const policy = resolveDefaultCompositionPolicy("home").map((r) =>
      r.slot === "slot0Food" ? { ...r, max: 2 } : r
    );
    const production = composeStoresHomeFeed(stores);
    const live = composeLiveHomeFeed(stores, {
      rows: policy,
      overrideCount: 1,
      rejectedOverrideSlots: [],
      engine: "live",
    });
    expect(live.slot0Food.length).toBe(2);
    const prodIds = production.slot0Food.map((e) => `${e.storeId}:${e.productId}`);
    const liveIds = live.slot0Food.map((e) => `${e.storeId}:${e.productId}`);
    expect(liveIds).toEqual(prodIds.slice(0, 2));
  });
});
