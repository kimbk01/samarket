import { describe, expect, it } from "vitest";
import {
  buildStoresHomePopularShelf,
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
    featuredItems: partial.featuredItems ?? [{ productId: "p1", name: "메뉴", price: 500 }],
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

describe("stores-home-feed popular section", () => {
  it("orders 0 → popular shelf hidden", () => {
    const sections = splitStoresHomeFeed([
      item({ id: "a", completedOrderCount30d: 0 }),
      item({ id: "b", completedOrderCount30d: 0 }),
    ]);
    expect(sections.popularStores).toEqual([]);
  });

  it("H1: open deliverable popular stores rank above closed despite lower raw count", () => {
    const sections = splitStoresHomeFeed([
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
        completedOrderCount30d: 50,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "c",
        status: "closed",
        completedOrderCount30d: 200,
        discoveryEligibilityRank: 5,
      }),
    ]);
    expect(sections.popularStores.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(sections.popularStores[0]?.id).toBe("a");
  });

  it("H2: dedupe preference does not leave only low-order leftover when primary consumed top popular", () => {
    const primaryIds = new Set(["a", "b"]);
    const shelf = buildStoresHomePopularShelf(
      [
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
      ],
      primaryIds
    );
    expect(shelf.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("H3: primary-only canonical popular → overlap allowed, not closed backfill", () => {
    const sections = splitStoresHomeFeed([
      item({
        id: "a",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 30,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "b",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 25,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "c",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 20,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "closed-only",
        status: "closed",
        completedOrderCount30d: 500,
        discoveryEligibilityRank: 5,
      }),
    ]);
    expect(sections.popularStores.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(sections.popularStores.some((s) => s.id === "closed-only")).toBe(false);
  });

  it("H4: enough non-primary popular candidates → primary dedupe without semantic loss", () => {
    const stores = [
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
        completedOrderCount30d: 90,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "c",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 80,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "d",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 70,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "e",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 60,
        discoveryEligibilityRank: 0,
      }),
      item({
        id: "f",
        status: "open",
        deliveryAvailable: true,
        completedOrderCount30d: 50,
        discoveryEligibilityRank: 0,
      }),
    ];
    const shelf = buildStoresHomePopularShelf(stores, new Set(["a", "b"]));
    expect(shelf.map((s) => s.id)).toEqual(["c", "d", "e", "f"]);
  });
});
