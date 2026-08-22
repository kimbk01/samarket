import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  pickStoresHomeOpenNow,
  type StoresHomeFeedSections,
} from "@/lib/stores/stores-home-feed-sections";

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
 * `splitStoresHomeFeed` 는 `openNow` 와 `popularStores` 를 각각 canonical metric으로 독립 계산한다.
 * `popularStores` 는 global `seen` leftover 가 아니라 completed-order ranking 기반 (`stores-home-feed-sections.ts`).
 * below-fold `StoresHomeFeedList` 가 `open` 을 exclude 하면 nearby/rest 가 비는 일반 케이스에서
 * **primary row 가 없으면** 히어로 아래가 빈 화면이 된다 (2026-05 회귀).
 *
 * DO NOT: `open` exclude 만 두고 primary row 마운트를 빼거나 `StoresHomeDeferredViewport` 뒤로만 둔다.
 * 검증: `npm run verify:stores-home-hub-contract` · `stores-home-feed-display-contract.test.ts`
 */
export function pickStoresHomePrimaryRowList(stores: StoreHomeFeedItem[]): StoreHomeFeedItem[] {
  return pickStoresHomeOpenNow(stores);
}

/**
 * below-fold 전용 — discovery 레일·nearby/rest 만. `open` 은 primary row 가 담당.
 */
export const STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS: readonly StoresHomeFeedSectionKey[] = [
  "premium",
  "open",
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
