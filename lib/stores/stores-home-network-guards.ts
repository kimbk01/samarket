"use client";



import type { AppLanguageCode } from "@/lib/i18n/config";

import {

  readExplicitLanguageCookie,

  readExplicitLocalLanguage,

} from "@/lib/i18n/language-preference";

import {

  getRuntimeAppLanguage,

  subscribeRuntimeAppLanguage,

} from "@/lib/i18n/runtime-app-language";

import { readMeStoreOrdersHubSummaryCache } from "@/lib/stores/store-delivery-api-client";



/** DevTools·서버 trace — stores 홈 feed/taxonomy prewarm vs mount 구분 */

export type StoresHomeClientCallSource =

  | "stores_home_prewarm"

  | "stores_home_mount"

  | "bottom_nav_prewarm";



function readExplicitStoresHomeLanguage(): AppLanguageCode | null {

  if (typeof window === "undefined") return null;

  return readExplicitLocalLanguage() ?? readExplicitLanguageCookie();

}



/**

 * Prewarm 전용 — hydration 전 `getRuntimeAppLanguage()` FALLBACK(en) 사용 금지.

 * 명시 opts·localStorage·cookie 만 즉시 신뢰한다.

 */

export function peekStoresHomePrewarmLanguage(language?: string): AppLanguageCode | null {
  const explicit = readExplicitStoresHomeLanguage();
  if (explicit) return explicit;
  if (language === "ko" || language === "en") return language;
  return null;
}



/** fetch dedupe·mount — 스토리지 명시가 있으면 런타임 FALLBACK 보다 우선 */

export function resolveStoresHomePrewarmLanguage(language?: string): AppLanguageCode {

  const peeked = peekStoresHomePrewarmLanguage(language);

  if (peeked) return peeked;

  return getRuntimeAppLanguage();

}



export type ScheduleStoresHomePrewarmWhenLanguageReadyOptions = {

  language?: string;

  run: (language: AppLanguageCode) => void;

};



let pendingPrewarmUnsub: (() => void) | null = null;

let pendingPrewarmRaf = 0;



function cancelPendingStoresHomePrewarmSchedule(): void {

  pendingPrewarmUnsub?.();

  pendingPrewarmUnsub = null;

  if (pendingPrewarmRaf) {

    cancelAnimationFrame(pendingPrewarmRaf);

    pendingPrewarmRaf = 0;

  }

}



/**

 * 언어가 아직 확정되지 않았을 때 prewarm 을 한 틱 미룬다.

 * Provider `setRuntimeAppLanguage`·`APP_LANGUAGE_CHANGED` 이후에만 실행.

 */

export function scheduleStoresHomePrewarmWhenLanguageReady(

  opts: ScheduleStoresHomePrewarmWhenLanguageReadyOptions

): void {

  if (typeof window === "undefined") return;



  const immediate = peekStoresHomePrewarmLanguage(opts.language);

  if (immediate) {

    opts.run(immediate);

    return;

  }



  cancelPendingStoresHomePrewarmSchedule();



  pendingPrewarmUnsub = subscribeRuntimeAppLanguage((lang) => {

    cancelPendingStoresHomePrewarmSchedule();

    opts.run(lang);

  });



  pendingPrewarmRaf = requestAnimationFrame(() => {

    pendingPrewarmRaf = 0;

    const explicit = readExplicitStoresHomeLanguage();

    if (explicit) {

      cancelPendingStoresHomePrewarmSchedule();

      opts.run(explicit);

      return;

    }

    const runtime = getRuntimeAppLanguage();

    if (runtime === "ko" || runtime === "en") {

      cancelPendingStoresHomePrewarmSchedule();

      opts.run(runtime);

    }

  });

}



/** hub_summary — mount·prewarm·bfcache 복귀가 겹칠 때 짧은 구간 재네트워크 억제 */

const HUB_SUMMARY_MIN_REFETCH_GAP_MS = 10_000;

let hubSummaryLastNetworkAt = 0;



export function markStoresHomeHubSummaryNetwork(): void {

  hubSummaryLastNetworkAt = Date.now();

}



export function shouldSkipStoresHomeHubSummaryFetch(opts?: {

  force?: boolean;

  /** bfcache `pageshow` — visibility 와 달리 기존처럼 재검증 허용 */

  fromBfcacheRestore?: boolean;

}): boolean {

  if (opts?.force || opts?.fromBfcacheRestore) return false;

  const snap = readMeStoreOrdersHubSummaryCache();

  if (snap.isFresh) return true;

  if (snap.value && Date.now() - hubSummaryLastNetworkAt < HUB_SUMMARY_MIN_REFETCH_GAP_MS) {

    return true;

  }

  return false;

}



export function storesHomeFeedSingleFlightKey(

  pathAndQuery: string,

  language: string

): string {

  const suffix =

    pathAndQuery.startsWith("?") ? pathAndQuery : pathAndQuery ? `?${pathAndQuery}` : "";

  return `stores:api:home-feed:${language}:${suffix}`;

}


