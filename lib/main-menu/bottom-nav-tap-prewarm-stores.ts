"use client";

import { prewarmStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  fetchStoresTaxonomyDeduped,
  isStoresTaxonomyClientCacheFresh,
} from "@/lib/stores/store-delivery-api-client";

export type BottomNavStoresPrewarmOptions = {
  storeHomeFeedSuffixes?: readonly string[];
};

export function prewarmBottomNavStoresTab(opts: BottomNavStoresPrewarmOptions = {}): void {
  const feedSuffixes = Array.from(new Set(["", ...(opts.storeHomeFeedSuffixes ?? [])]));
  for (const suffix of feedSuffixes) {
    void prewarmStoreHomeFeedClientCache(suffix).catch(() => {
      /* stores 홈 피드 prewarm 실패는 무시 */
    });
  }
  if (!isStoresTaxonomyClientCacheFresh()) {
    void fetchStoresTaxonomyDeduped().catch(() => {
      /* taxonomy prewarm 실패 무시 */
    });
  }
  void fetchMeStoreOrdersHubSummaryDeduped().catch(() => {
    /* 허브 요약 prewarm 실패 무시 */
  });
}
