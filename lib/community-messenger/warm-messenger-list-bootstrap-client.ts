"use client";

import {
  isBootstrapCacheFresh,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapFull,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  fetchCommunityMessengerBootstrapClient,
  fetchCommunityMessengerBootstrapCriticalClient,
} from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/types";
import {
  recordMessengerHomeWarmCallSiteInvocation,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

const WARM_CACHE_READY_EVENT = "samarket:messenger-home-warm-cache-ready";

function notifyWarmCacheReady(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WARM_CACHE_READY_EVENT));
}

function hasWarmSkipBootstrap(): boolean {
  if (peekMessengerBootstrapFull() || peekMessengerBootstrapCritical()) return true;
  return isBootstrapCacheFresh();
}

/**
 * 하단 탭 pointerdown 직후 — 목록 cold gate(`bootstrap?tier=critical`)와 동일 tier 를 prewarm.
 * lite 는 enrich 용 — critical 과 병렬 시작해 `fetchCommunityMessengerBootstrapClient("lite")` 단일 비행과 합류.
 */
export function warmMessengerListBootstrapClient(): void {
  if (typeof window === "undefined") return;
  if (isDevSafeMode()) return;
  if (hasWarmSkipBootstrap()) {
    samarketMessengerHomeDebugEvent("messenger_home_warm_skip_cached");
    return;
  }
  recordMessengerHomeWarmCallSiteInvocation();
  void (async () => {
    samarketMessengerHomeDebugEvent("messenger_home_warm_start");
    try {
      /** critical·lite 병렬 — lite 는 `fetchCommunityMessengerBootstrapClient` 단일 비행과 합류 */
      const criticalP = (async () => {
        const resCrit = await fetchCommunityMessengerBootstrapCriticalClient();
        if (!resCrit.ok) return;
        const jsonCrit = (await resCrit.clone().json().catch(() => null)) as
          | (CommunityMessengerBootstrapCritical & { ok?: boolean })
          | null;
        if (jsonCrit?.ok === true && jsonCrit.tier === "critical") {
          primeMessengerBootstrapCritical(jsonCrit);
          samarketMessengerHomeDebugEvent("messenger_home_warm_critical_success");
          notifyWarmCacheReady();
        }
      })();

      const liteP = (async () => {
        const resLite = await fetchCommunityMessengerBootstrapClient("lite");
        if (!resLite.ok) return;
        const json = (await resLite.clone().json().catch(() => null)) as Record<string, unknown> | null;
        if (!json || json.ok !== true) return;
        const payload = { ...json };
        delete payload.ok;
        primeBootstrapCache(payload as CommunityMessengerBootstrap);
        samarketMessengerHomeDebugEvent("messenger_home_warm_success");
        notifyWarmCacheReady();
      })();

      await Promise.all([criticalP, liteP]);
    } catch {
      /* ignore */
    }
  })();
}
