"use client";

import {
  cmWarmNetworkPayloadFingerprint,
  cmWarmNetworkRoomIdsFingerprint,
  isBootstrapCacheFresh,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapFull,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
  recordWarmNetworkProvenance,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  applyCmHomeCutoverGateFromResponseJson,
  peekCmHomeCutoverGate,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-client";
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
        if (!resCrit.ok) {
          return;
        }
        const jsonCrit = (await resCrit.clone().json().catch(() => null)) as
          | (CommunityMessengerBootstrapCritical & { ok?: boolean; runtimeMeta?: unknown })
          | null;
        if (jsonCrit?.ok === true && jsonCrit.tier === "critical") {
          // 처리 순서(§2/§7): response json → runtimeMeta Gate apply → snapshot → fingerprint
          //   → cache prime + memory-only provenance → notifyWarmCacheReady. Gate 적용 전 prime 금지.
          applyCmHomeCutoverGateFromResponseJson(jsonCrit);
          const gate = peekCmHomeCutoverGate();
          const critRooms = [...(jsonCrit.chats ?? []), ...(jsonCrit.groups ?? [])];
          const roomIdsFingerprint = cmWarmNetworkRoomIdsFingerprint(critRooms);
          const payloadFingerprint = cmWarmNetworkPayloadFingerprint(critRooms);
          // runtimeMeta 는 cache/sessionStorage 에 남기지 않는다(§6).
          const cleanCrit = { ...jsonCrit };
          delete (cleanCrit as { runtimeMeta?: unknown }).runtimeMeta;
          primeMessengerBootstrapCritical(cleanCrit);
          recordWarmNetworkProvenance("critical", {
            tier: "critical",
            gateVersion: gate.gateVersion,
            payloadFingerprint,
            roomIdsFingerprint,
          });
          samarketMessengerHomeDebugEvent("messenger_home_warm_critical_success");
          notifyWarmCacheReady();
        }
      })();

      const liteP = (async () => {
        const resLite = await fetchCommunityMessengerBootstrapClient("lite");
        if (!resLite.ok) {
          return;
        }
        const json = (await resLite.clone().json().catch(() => null)) as Record<string, unknown> | null;
        if (!json || json.ok !== true) return;
        // 처리 순서(§2/§7): runtimeMeta Gate apply → snapshot → fingerprint → prime + provenance.
        applyCmHomeCutoverGateFromResponseJson(json);
        const gate = peekCmHomeCutoverGate();
        const payload = { ...json };
        delete payload.ok;
        // runtimeMeta 는 cache/sessionStorage 에 남기지 않는다(§6).
        delete payload.runtimeMeta;
        const liteRooms = [
          ...(((payload.chats as { id?: string }[] | undefined) ?? [])),
          ...(((payload.groups as { id?: string }[] | undefined) ?? [])),
        ];
        const roomIdsFingerprint = cmWarmNetworkRoomIdsFingerprint(liteRooms);
        const payloadFingerprint = cmWarmNetworkPayloadFingerprint(liteRooms);
        primeBootstrapCache(payload as CommunityMessengerBootstrap);
        // lite 응답이 실제 final full cache 로 사용되는 현재 계약 유지(§4) — final provenance 는 "full" slot.
        recordWarmNetworkProvenance("full", {
          tier: "lite",
          gateVersion: gate.gateVersion,
          payloadFingerprint,
          roomIdsFingerprint,
        });
        samarketMessengerHomeDebugEvent("messenger_home_warm_success");
        notifyWarmCacheReady();
      })();

      await Promise.all([criticalP, liteP]);
    } catch {
      /* ignore */
    }
  })();
}
