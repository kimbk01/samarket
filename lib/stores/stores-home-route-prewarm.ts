"use client";

import { prewarmStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  fetchStoresTaxonomyDeduped,
  isStoresTaxonomyClientCacheFresh,
} from "@/lib/stores/store-delivery-api-client";

export type StoresHomeRoutePrewarmOptions = {
  /** home-feed keys: always includes `""`; add region suffix like `"?region=..."` when set */
  storeHomeFeedSuffixes?: readonly string[];
  language?: string;
};

/**
 * `/stores` 홈 진입 공통 prewarm — 하단 탭 pointerdown·직접 URL·새로고침 모두 동일 그래프.
 * fetcher single-flight·TTL 캐시로 중복 네트워크는 자동 dedupe.
 */
export function prewarmStoresHomeRoute(opts: StoresHomeRoutePrewarmOptions = {}): void {
  if (typeof window === "undefined") return;

  const feedSuffixes = Array.from(new Set(["", ...(opts.storeHomeFeedSuffixes ?? [])]));
  for (const suffix of feedSuffixes) {
    void prewarmStoreHomeFeedClientCache(suffix).catch(() => {
      /* stores 홈 피드 prewarm 실패는 무시 */
    });
  }
  if (!isStoresTaxonomyClientCacheFresh(opts.language)) {
    void fetchStoresTaxonomyDeduped({ language: opts.language }).catch(() => {
      /* taxonomy prewarm 실패 무시 */
    });
  }
  void fetchMeStoreOrdersHubSummaryDeduped().catch(() => {
    /* 허브 요약 prewarm 실패 무시 */
  });
}
