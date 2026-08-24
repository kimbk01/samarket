import { describe, expect, it } from "vitest";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  resolveOrderedVisibleHomeCompositionSlots,
  splitHomeCompositionSlotsForRender,
} from "@/lib/stores/composition/stores-composition-home-section-order";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

function feedItem(id: string): StoreHomeFeedItem {
  return {
    id,
    slug: id,
    nameKo: id,
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
  };
}

describe("stores-composition-home-section-order", () => {
  const stores = Array.from({ length: 24 }, (_, i) => feedItem(`s${i}`));
  const composition = composeStoresHomeFeed(stores);

  it("default policy preserves order_now before popular_menu among visible slots", () => {
    const policy = resolveDefaultCompositionPolicy("home");
    const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition);
    expect(ordered.includes("slot1Stores")).toBe(false);
    expect(ordered.indexOf("slot0Food")).toBeLessThan(ordered.indexOf("slot2Food"));
  });

  it("swapped slot0/slot2 policy order places popular before order_now", () => {
    const policy = resolveDefaultCompositionPolicy("home").map((row) => {
      if (row.slot === "slot0Food") return { ...row, order: 2 };
      if (row.slot === "slot2Food") return { ...row, order: 0 };
      return row;
    });
    const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition);
    expect(ordered[0]).toBe("slot2Food");
    expect(ordered.includes("slot0Food")).toBe(true);
    expect(ordered.indexOf("slot2Food")).toBeLessThan(ordered.indexOf("slot0Food"));
  });

  it("disabled section is omitted without breaking others", () => {
    const policy = resolveDefaultCompositionPolicy("home").map((row) =>
      row.slot === "slot2Food" ? { ...row, enabled: false } : row
    );
    const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition);
    expect(ordered.includes("slot2Food")).toBe(false);
    expect(ordered.includes("slot0Food")).toBe(true);
  });

  it("splits eager vs deferred by visible order", () => {
    const policy = resolveDefaultCompositionPolicy("home");
    const ordered = resolveOrderedVisibleHomeCompositionSlots(policy, composition);
    const { eagerSlots, deferredSlots } = splitHomeCompositionSlotsForRender(ordered);
    expect(eagerSlots).toHaveLength(2);
    expect(eagerSlots[0]).toBe(ordered[0]);
    expect(eagerSlots[1]).toBe(ordered[1]);
    expect(deferredSlots.join()).toBe(ordered.slice(2).join());
  });
});
