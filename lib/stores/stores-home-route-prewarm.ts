"use client";



import { prewarmStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";

import {

  fetchMeStoreOrdersHubSummaryDeduped,

  fetchStoresTaxonomyDeduped,

  isStoresTaxonomyClientCacheFresh,

} from "@/lib/stores/store-delivery-api-client";

import type { AppLanguageCode } from "@/lib/i18n/config";

import {

  peekStoresHomePrewarmLanguage,

  scheduleStoresHomePrewarmWhenLanguageReady,

  shouldSkipStoresHomeHubSummaryFetch,

  type StoresHomeClientCallSource,

} from "@/lib/stores/stores-home-network-guards";



export type StoresHomeRoutePrewarmOptions = {
  /**
   * home-feed query suffixes to warm (e.g. `"?region=…&district=…"`).
   * When non-empty, **only** those keys are warmed — do not also force `""`
   * (Phase 0: empty+region fan-out duplicated `/api/stores/home-feed`).
   * When omitted/empty, warm root `""` only.
   */
  storeHomeFeedSuffixes?: readonly string[];
  language?: string;
  clientCallSource?: StoresHomeClientCallSource;
};

function scheduleStoresHomeNonCriticalPrewarm(run: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 2500 });
    return;
  }
  window.setTimeout(run, 0);
}

/** CONTRACT — regional suffixes replace root `""`; never union both. */
export function resolveStoresHomePrewarmFeedSuffixes(
  storeHomeFeedSuffixes?: readonly string[]
): string[] {
  const requested = (storeHomeFeedSuffixes ?? []).filter((s) => typeof s === "string");
  if (requested.length > 0) return Array.from(new Set(requested));
  return [""];
}

function runStoresHomeRoutePrewarm(
  language: AppLanguageCode,
  opts: StoresHomeRoutePrewarmOptions
): void {
  const clientCallSource = opts.clientCallSource ?? "stores_home_prewarm";
  const feedSuffixes = resolveStoresHomePrewarmFeedSuffixes(opts.storeHomeFeedSuffixes);

  for (const suffix of feedSuffixes) {
    void prewarmStoreHomeFeedClientCache(suffix, { language, clientCallSource }).catch(() => {
      /* stores 홈 피드 prewarm 실패는 무시 */
    });
  }

  if (!isStoresTaxonomyClientCacheFresh(language)) {
    void fetchStoresTaxonomyDeduped({ language, clientCallSource }).catch(() => {
      /* taxonomy prewarm 실패 무시 */
    });
  }

  scheduleStoresHomeNonCriticalPrewarm(() => {
    if (shouldSkipStoresHomeHubSummaryFetch()) return;
    void fetchMeStoreOrdersHubSummaryDeduped().catch(() => {
      /* 허브 요약 prewarm 실패 무시 */
    });
  });
}



/**

 * `/stores` 홈 진입 공통 prewarm — 하단 탭 pointerdown·직접 URL·새로고침 모두 동일 그래프.

 * fetcher single-flight·TTL 캐시로 중복 네트워크는 자동 dedupe.

 * `hub_summary` 는 idle — `home-feed`·`taxonomy` critical path 와 경쟁하지 않게 한다.

 */

export function prewarmStoresHomeRoute(opts: StoresHomeRoutePrewarmOptions = {}): void {

  if (typeof window === "undefined") return;



  const immediate = peekStoresHomePrewarmLanguage(opts.language);

  if (immediate) {

    runStoresHomeRoutePrewarm(immediate, opts);

    return;

  }



  scheduleStoresHomePrewarmWhenLanguageReady({

    language: opts.language,

    run: (language) => runStoresHomeRoutePrewarm(language, opts),

  });

}


