import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoresHomeFeedSections } from "@/lib/stores/stores-home-feed-sections";

export type StoresHomeFeedSectionKey =
  | "premium"
  | "open"
  | "popular"
  | "discount"
  | "top"
  | "nearby"
  | "rest";

/**
 * CONTRACT — `/stores` hero 직후 즉시 그리는 `StoreDeliveryRowCard` 목록 소스.
 *
 * CUT3 — API recommended+exposure 순서에서 Slot0 소비 store 제외 remainder.
 * `openNow` 풀과 동일하지 않음 (`composeStoresHomeFeed` slot1).
 *
 * DO NOT: `open` exclude 만 두고 primary row 마운트를 빼거나 `StoresHomeDeferredViewport` 뒤로만 둔다.
 * 검증: `npm run verify:stores-home-hub-contract` · `stores-home-feed-display-contract.test.ts`
 */
export function pickStoresHomePrimaryRowList(stores: StoreHomeFeedItem[]): StoreHomeFeedItem[] {
  return composeStoresHomeFeed(stores).slot1Stores;
}

/**
 * below-fold 전용 — slot6 nearby/rest. food 레일·primary row 는 composer·Hub 가 담당.
 */
export const STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS: readonly StoresHomeFeedSectionKey[] = [
  "premium",
  "open",
  "popular",
  "discount",
  "top",
];

export type StoresHomeBelowFoldFeedBlock = {
  key: StoresHomeFeedSectionKey;
  stores: StoreHomeFeedItem[];
};

export function resolveStoresHomeBelowFoldFeedBlocks(
  sections: StoresHomeFeedSections,
  excludeKeys: readonly StoresHomeFeedSectionKey[] = STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS
): StoresHomeBelowFoldFeedBlock[] {
  const excluded = new Set(excludeKeys);
  const candidates: StoresHomeBelowFoldFeedBlock[] = [
    { key: "premium", stores: sections.premium },
    { key: "open", stores: sections.openNow },
    { key: "popular", stores: sections.popularStores },
    { key: "discount", stores: sections.discounted },
    { key: "top", stores: sections.topRated },
    { key: "nearby", stores: sections.nearby },
    { key: "rest", stores: sections.feedRest },
  ];
  return candidates.filter((b) => b.stores.length > 0 && !excluded.has(b.key));
}

/** below-fold `StoresHomeFeedList` emptyFallback — primary row 가 매장을 이미 표시하면 금지 */
export function shouldStoresHomeBelowFoldShowEmptyFallback(opts: {
  totalStoreCount: number;
  primaryRowStoreCount: number;
  belowFoldBlockCount: number;
}): boolean {
  if (opts.totalStoreCount === 0) return true;
  if (opts.primaryRowStoreCount > 0) return false;
  return opts.belowFoldBlockCount === 0;
}

/** CI — feed API 에 매장이 있는데 row 목록 경로가 모두 0이면 회귀 */
export function detectStoresHomeEmptyRowListRegression(opts: {
  totalStoreCount: number;
  primaryRowStoreCount: number;
  belowFoldBlockCount: number;
}): boolean {
  if (opts.totalStoreCount === 0) return false;
  return opts.primaryRowStoreCount === 0 && opts.belowFoldBlockCount === 0;
}

/** BelowFold FeedList — composer slot6 only */
export function buildStoresHomeBelowFoldFeedSectionsFromComposition(
  composition: ReturnType<typeof composeStoresHomeFeed>
): StoresHomeFeedSections {
  return {
    openNow: [],
    popularStores: [],
    premium: [],
    topRated: [],
    discounted: [],
    nearby: composition.slot6NearbyStores,
    feedRest: composition.slot6RestStores,
  };
}
