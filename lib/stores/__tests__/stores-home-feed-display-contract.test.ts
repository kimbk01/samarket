import { describe, expect, it } from "vitest";
import {
  detectStoresHomeEmptyRowListRegression,
  pickStoresHomePrimaryRowList,
  resolveStoresHomeBelowFoldFeedBlocks,
  shouldStoresHomeBelowFoldShowEmptyFallback,
  STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS,
} from "@/lib/stores/stores-home-feed-display-contract";
import { splitStoresHomeFeed } from "@/lib/stores/stores-home-feed-sections";
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
  };
}

describe("stores-home-feed-display-contract", () => {
  it("typical open stores without distanceKm — primary row must carry the list", () => {
    const stores = [
      item({ id: "a" }),
      item({ id: "b" }),
      item({ id: "c" }),
    ];
    const sections = splitStoresHomeFeed(stores);
    const primary = pickStoresHomePrimaryRowList(stores);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );

    expect(primary).toHaveLength(3);
    expect(sections.openNow).toHaveLength(3);
    expect(belowFold).toHaveLength(0);
    expect(detectStoresHomeEmptyRowListRegression({
      totalStoreCount: stores.length,
      primaryRowStoreCount: primary.length,
      belowFoldBlockCount: belowFold.length,
    })).toBe(false);
    expect(
      shouldStoresHomeBelowFoldShowEmptyFallback({
        totalStoreCount: stores.length,
        primaryRowStoreCount: primary.length,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(false);
  });

  it("detects regression when open is excluded below-fold but primary row is missing", () => {
    const stores = [item({ id: "a" }), item({ id: "b" })];
    const sections = splitStoresHomeFeed(stores);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );

    expect(belowFold).toHaveLength(0);
    expect(
      detectStoresHomeEmptyRowListRegression({
        totalStoreCount: stores.length,
        primaryRowStoreCount: 0,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(true);
  });

  it("closed-only feed still allows below-fold rest without primary row", () => {
    const stores = [item({ id: "a", status: "closed", deliveryAvailable: true })];
    const sections = splitStoresHomeFeed(stores);
    const primary = pickStoresHomePrimaryRowList(stores);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );

    expect(primary).toHaveLength(0);
    expect(belowFold.some((b) => b.key === "rest")).toBe(true);
    expect(
      detectStoresHomeEmptyRowListRegression({
        totalStoreCount: stores.length,
        primaryRowStoreCount: primary.length,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(false);
  });
});
