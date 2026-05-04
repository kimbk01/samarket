"use client";

/**
 * 홈 사일런트 갱신 — `GET /api/community-messenger/home-sync` 한 번으로
 * 방 목록·친구 요청·친구 목록 정합 (이전 3병렬 fetch 대비 RTT·핸들러 비용 감소).
 * 정책 표: `docs/messenger-realtime-policy.md`
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { messengerMonitorHomeSyncClientPhases } from "@/lib/community-messenger/monitoring/client";
import {
  recordMessengerHomeHomeSyncNetworkFetch,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

const FLIGHT_KEY = "community-messenger:home:silent:home_sync";

export type FetchCommunityMessengerHomeSilentListsOpts = {
  signal?: AbortSignal;
  /** 기본 full — 홈 첫 silent는 critical 후 idle 에 full 보강 */
  tier?: "critical" | "full";
};

export type CommunityMessengerHomeSilentListsPayload = {
  res: Response;
  json: {
    ok?: boolean;
    chats?: CommunityMessengerRoomSummary[];
    groups?: CommunityMessengerRoomSummary[];
    requests?: CommunityMessengerBootstrap["requests"];
    friends?: CommunityMessengerProfileLite[];
  };
};

function homeSyncUrl(tier: "critical" | "full"): string {
  return tier === "critical"
    ? "/api/community-messenger/home-sync?tier=critical"
    : "/api/community-messenger/home-sync";
}

/**
 * `signal` 이 있어도 tier별 `runSingleFlight` 로 동시 요청 1개로 합침 — full critical 경쟁·중복 완화.
 */
export function fetchCommunityMessengerHomeSilentLists(
  opts: FetchCommunityMessengerHomeSilentListsOpts = {}
): Promise<CommunityMessengerHomeSilentListsPayload> {
  const tier = opts.tier ?? "full";
  const flightKey = `${FLIGHT_KEY}:${tier}`;
  const url = homeSyncUrl(tier);

  return runSingleFlight(flightKey, async () => {
    recordMessengerHomeHomeSyncNetworkFetch();
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const res = await fetch(url, {
      cache: "default",
      credentials: "include",
      signal: opts.signal,
    });
    const t1 = typeof performance !== "undefined" ? performance.now() : 0;
    const json = (await res.json().catch(() => ({}))) as CommunityMessengerHomeSilentListsPayload["json"];
    const t2 = typeof performance !== "undefined" ? performance.now() : 0;
    if (typeof performance !== "undefined") {
      const networkMs = Math.round(t1 - t0);
      const jsonParseMs = Math.round(t2 - t1);
      messengerMonitorHomeSyncClientPhases(networkMs, jsonParseMs, { tier });
      samarketMessengerHomeDebugEvent("messenger_home_sync_silent_fetch", {
        tier,
        url,
        ok: res.ok,
        status: res.status,
        networkMs,
        jsonParseMs,
        totalMs: Math.round(t2 - t0),
      });
    }
    return { res, json };
  });
}
