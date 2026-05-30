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
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  recordMessengerHomeWarmCallSiteInvocation,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

function hasWarmSkipBootstrap(): boolean {
  if (peekMessengerBootstrapFull() || peekMessengerBootstrapCritical()) return true;
  return isBootstrapCacheFresh();
}

/**
 * 하단 탭 pointerdown 직후 — 목록 cold gate(`bootstrap?tier=critical`)와 동일 tier 를 prewarm.
 * lite 는 deferred enrich 용으로 이어서 warm(기존 `primeBootstrapCache` 계약 유지).
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
      const resCrit = await fetchCommunityMessengerBootstrapCriticalClient();
      if (resCrit.ok) {
        const jsonCrit = (await resCrit.clone().json().catch(() => null)) as
          | (CommunityMessengerBootstrapCritical & { ok?: boolean })
          | null;
        if (jsonCrit?.ok === true && jsonCrit.tier === "critical") {
          primeMessengerBootstrapCritical(jsonCrit);
          samarketMessengerHomeDebugEvent("messenger_home_warm_critical_success");
        }
      }
      if (hasWarmSkipBootstrap()) return;
      const resLite = await runSingleFlight("community-messenger:list-bootstrap-warm", () =>
        fetchCommunityMessengerBootstrapClient("lite")
      );
      if (!resLite.ok) return;
      const json = (await resLite.clone().json().catch(() => null)) as Record<string, unknown> | null;
      if (!json || json.ok !== true) return;
      const payload = { ...json };
      delete payload.ok;
      primeBootstrapCache(payload as CommunityMessengerBootstrap);
      samarketMessengerHomeDebugEvent("messenger_home_warm_success");
    } catch {
      /* ignore */
    }
  })();
}
