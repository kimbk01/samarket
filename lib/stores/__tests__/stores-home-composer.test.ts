import { describe, expect, it } from "vitest";
import {
  composeStoresHomeFeed,
  STORES_HOME_POPULAR_SHELF_MAX,
  STORES_HOME_SLOT0_FOOD_MAX,
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
      { productId: `p-${partial.id}`, name: "치킨", price: 500 },
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

describe("composeStoresHomeFeed — exposure policy", () => {
  it("T1: Slot0 ∩ Slot1 = ∅", () => {
    const stores = [
      item({ id: "a", status: "open", deliveryAvailable: true }),
      item({ id: "b", status: "closed" }),
      item({ id: "c" }),
    ];
    const composition = composeStoresHomeFeed(stores);
    const slot0Ids = new Set(composition.slot0Food.map((e) => e.storeId));
    expect(composition.slot1Stores.every((s) => !slot0Ids.has(s.id))).toBe(true);
  });

  it("T2: Slot0 one store → one product", () => {
    const composition = composeStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        featuredItems: [
          { productId: "p1", name: "A", price: 100 },
          { productId: "p2", name: "B", price: 200 },
        ],
      }),
    ]);
    expect(composition.slot0Food.filter((e) => e.storeId === "a")).toHaveLength(1);
  });

  it("T3: Slot1 relative API order preserved after Slot0 exclusion", () => {
    const stores = [
      item({ id: "a", status: "open", deliveryAvailable: true }),
      item({ id: "b", status: "closed" }),
      item({ id: "c", status: "closed" }),
      item({ id: "d", status: "closed" }),
    ];
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot1Stores.map((s) => s.id)).toEqual(["b", "c", "d"]);
  });

  it("T4: Slot2 popular metric order preserved", () => {
    const stores = Array.from({ length: 30 }, (_, i) =>
      item({
        id: `s${i}`,
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 100 - i,
        discoveryEligibilityRank: 0,
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

  it("T5: valid metric candidates survive Slot0/1 — shelves not starved", () => {
    const stores = Array.from({ length: STORE_HOME_FEED_RESPONSE_MAX }, (_, i) => richStore(i));
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot0Food.length).toBe(STORES_HOME_SLOT0_FOOD_MAX);
    expect(composition.slot1Stores.length).toBe(STORE_HOME_FEED_RESPONSE_MAX - STORES_HOME_SLOT0_FOOD_MAX);
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot3Food.length).toBeGreaterThan(0);
    expect(composition.slot4Food.length).toBeGreaterThan(0);
  });

  it("T6: horizontal shelf cross-repeat is bounded — Slot6 excludes horizontal", () => {
    const stores = Array.from({ length: 30 }, (_, i) => richStore(i));
    const composition = composeStoresHomeFeed(stores);
    const horizontalIds = new Set([
      ...composition.slot2Food.map((e) => e.storeId),
      ...composition.slot3Food.map((e) => e.storeId),
      ...composition.slot4Food.map((e) => e.storeId),
      ...composition.slot5Food.map((e) => e.storeId),
    ]);
    for (const s of composition.slot6NearbyStores) {
      expect(horizontalIds.has(s.id)).toBe(false);
    }
    for (const s of composition.slot6RestStores) {
      expect(horizontalIds.has(s.id)).toBe(false);
    }
  });

  it("T7: no ad-hoc backfill when candidates missing", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "a", status: "open", deliveryAvailable: true, completedOrderCount30d: 0 }),
    ]);
    expect(composition.slot2Food).toEqual([]);
    expect(composition.slot0Food).toHaveLength(1);
  });

  it("T8: Slot2 first card avoids immediate repeat of Slot1 tail when alternatives exist", () => {
    const stores = [
      item({ id: "a", status: "open", deliveryAvailable: true, completedOrderCount30d: 50 }),
      item({ id: "b", status: "closed", completedOrderCount30d: 100 }),
      item({ id: "c", status: "closed", completedOrderCount30d: 90 }),
    ];
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot1Stores.at(-1)?.id).toBe("c");
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot2Food[0]?.storeId).not.toBe("c");
  });

  it("T9: candidate shortage does not fake-fill with duplicate store/product", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "only", status: "open", deliveryAvailable: true, completedOrderCount30d: 10 }),
    ]);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(1);
    expect(composition.slot3Food).toEqual([]);
  });

  it("T10: Slot3 only real delivery fee strike evidence", () => {
    const composition = composeStoresHomeFeed([
      item({ id: "a", deliveryFeeStrikePhp: 30 }),
      item({ id: "b", deliveryFeeStrikePhp: 0 }),
    ]);
    expect(composition.slot3Food.map((e) => e.storeId)).toEqual(["a"]);
    expect(composition.slot3Food[0]?.discountEvidence).toBe("delivery_fee_strike");
  });
});

describe("composeStoresHomeFeed — API pool fixtures", () => {
  it("CASE A: 48 open/deliverable — discovery shelves populated", () => {
    const stores = Array.from({ length: STORE_HOME_FEED_RESPONSE_MAX }, (_, i) => richStore(i));
    const composition = composeStoresHomeFeed(stores);

    expect(composition.slot0Food.length).toBe(STORES_HOME_SLOT0_FOOD_MAX);
    expect(composition.slot1Stores.length).toBe(32);
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot3Food.length).toBeGreaterThan(0);
    expect(composition.slot4Food.length).toBeGreaterThan(0);
    expect(composition.slot5Food.length).toBeGreaterThan(0);
  });

  it("CASE B: 20 stores metric overlap — multiple discovery reasons", () => {
    const stores = Array.from({ length: 20 }, (_, i) => richStore(i));
    const composition = composeStoresHomeFeed(stores);

    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot3Food.length).toBeGreaterThan(0);
    expect(composition.slot4Food.length).toBeGreaterThan(0);
    // horizontal overlap allowed (different shelf purpose)
    const slot2Ids = new Set(composition.slot2Food.map((e) => e.storeId));
    const slot3Overlap = composition.slot3Food.filter((e) => slot2Ids.has(e.storeId));
    expect(slot3Overlap.length).toBeGreaterThan(0);
  });

  it("CASE C: 8 stores — short shelves from real shortage not registry starvation", () => {
    const stores = Array.from({ length: 8 }, (_, i) =>
      item({
        id: `s${i}`,
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 10,
      })
    );
    const composition = composeStoresHomeFeed(stores);
    expect(composition.slot0Food.length).toBe(8);
    expect(composition.slot1Stores.length).toBe(0);
    expect(composition.slot2Food.length).toBeGreaterThan(0);
    expect(composition.slot2Food.length).toBeLessThanOrEqual(STORES_HOME_POPULAR_SHELF_MAX);
  });
});
