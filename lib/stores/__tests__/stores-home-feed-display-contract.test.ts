import { describe, expect, it } from "vitest";
import {
  buildStoresHomeBelowFoldFeedSectionsFromComposition,
  detectStoresHomeEmptyRowListRegression,
  pickStoresHomePrimaryRowList,
  resolveStoresHomeBelowFoldFeedBlocks,
  shouldStoresHomeBelowFoldShowEmptyFallback,
  STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS,
} from "@/lib/stores/stores-home-feed-display-contract";
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
  };
}

describe("stores-home-feed-display-contract", () => {
  it("open stores in slot0 — remainder stores carry rest_stores row", () => {
    const stores = [
      item({ id: "a", status: "open", deliveryAvailable: true }),
      item({ id: "b", status: "closed", deliveryAvailable: true }),
      item({ id: "c", status: "closed", deliveryAvailable: true }),
    ];
    const composition = composeStoresHomeFeed(stores);
    const sections = buildStoresHomeBelowFoldFeedSectionsFromComposition(composition);
    const primary = pickStoresHomePrimaryRowList(stores);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );

    expect(composition.slot0Food).toHaveLength(1);
    expect(composition.slot1Stores).toEqual([]);
    // Owner 2026-10-29 — 더 많은 매장은 독립 선반 (위 선반 노출 매장 제외 없음)
    expect(primary.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(belowFold.map((b) => b.key)).toEqual(["rest"]);
    expect(
      detectStoresHomeEmptyRowListRegression({
        totalStoreCount: stores.length,
        primaryRowStoreCount: primary.length,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(false);
  });

  it("two open-only stores fill slot0 — rest shelf still lists them (independent shelves)", () => {
    const stores = [item({ id: "a" }), item({ id: "b" })];
    const composition = composeStoresHomeFeed(stores);
    const sections = buildStoresHomeBelowFoldFeedSectionsFromComposition(composition);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );
    const primary = pickStoresHomePrimaryRowList(stores);

    expect(composition.slot0Food).toHaveLength(2);
    expect(primary.map((s) => s.id)).toEqual(["a", "b"]);
    expect(belowFold.map((b) => b.key)).toEqual(["rest"]);
    expect(
      detectStoresHomeEmptyRowListRegression({
        totalStoreCount: stores.length,
        primaryRowStoreCount: primary.length,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(false);
  });

  it("closed-only feed uses rest_stores — below-fold rest optional", () => {
    const stores = [item({ id: "a", status: "closed", deliveryAvailable: true })];
    const composition = composeStoresHomeFeed(stores);
    const sections = buildStoresHomeBelowFoldFeedSectionsFromComposition(composition);
    const primary = pickStoresHomePrimaryRowList(stores);
    const belowFold = resolveStoresHomeBelowFoldFeedBlocks(
      sections,
      STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
    );

    expect(primary).toHaveLength(1);
    expect(primary[0]?.id).toBe("a");
    expect(belowFold.map((b) => b.key)).toEqual(["rest"]);
    expect(
      detectStoresHomeEmptyRowListRegression({
        totalStoreCount: stores.length,
        primaryRowStoreCount: primary.length,
        belowFoldBlockCount: belowFold.length,
      })
    ).toBe(false);
  });

  it("rest_stores lists every store independently of slot0 (Owner 2026-10-29)", () => {
    const stores = [
      item({ id: "open-a", status: "open", deliveryAvailable: true }),
      item({ id: "open-b", status: "open", deliveryAvailable: true }),
      item({ id: "closed-c", status: "closed", deliveryAvailable: true }),
    ];
    const composition = composeStoresHomeFeed(stores);
    const primary = pickStoresHomePrimaryRowList(stores);
    expect(composition.slot0Food.map((e) => e.storeId)).toEqual(["open-a", "open-b"]);
    expect(primary.map((s) => s.id)).toEqual(["open-a", "open-b", "closed-c"]);
  });
});
