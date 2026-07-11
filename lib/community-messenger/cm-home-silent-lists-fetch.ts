"use client";

/**
 * 홈 사일런트 갱신 — `GET /api/community-messenger/home-sync` 한 번으로
 * 방 목록·친구 요청·친구 목록 정합 (이전 3병렬 fetch 대비 RTT·핸들러 비용 감소).
 * 정책 표: `docs/messenger-realtime-policy.md`
 *
 * **재진입·abort**: `refresh()` 가 매번 이전 `AbortController` 를 abort 하면
 * `fetch(..., { signal })` 가 끊기며 `runSingleFlight` 가 정리되어 **같은 tier 의 연속 호출이
 * 새 네트워크**로 열리고 DevTools 에 0B(aborted) 행이 늘 수 있다.
 * → silent home-sync 의 **실제 HTTP** 에는 `signal` 을 넘기지 않는다(merge 는 호출측 `signal.aborted` 로 그대로 게이트).
 * → 짧은 TTL 내 동일 tier 성공 응답은 **재사용**(요청 스코프와 동일 JSON; `forceNetwork` 로 우회 가능).
 * → pathname 전환·동일 경로 왕복은 **재생 TTL·안정화 창**으로 네트워크 사이클을 추가로 억제한다.
 */
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { messengerMonitorHomeSyncClientPhases } from "@/lib/community-messenger/monitoring/client";
import {
  recordMessengerHomeHomeSyncNetworkFetch,
  recordMessengerHomeHomeSyncReplaySyntheticReturn,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { logHomeSyncReentry } from "@/lib/community-messenger/cm-home-sync-reentry-log";
import {
  logHomeSyncSuppress,
  type HomeSyncSuppressReason,
} from "@/lib/community-messenger/cm-home-sync-suppress-log";
import {
  MESSENGER_HOME_SILENT_SYNC_CRITICAL_REPLAY_TTL_MS,
  MESSENGER_HOME_SILENT_SYNC_FULL_REPLAY_TTL_MS,
  MESSENGER_HOME_SILENT_SYNC_PATH_ROUNDTRIP_DEBOUNCE_MS,
  MESSENGER_HOME_SILENT_SYNC_ROUTE_STABILIZE_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import {
  deferHomeSyncFetch,
  noteHomeSyncInflightDuringEntry,
  shouldDeferHomeSyncStart,
} from "@/lib/community-messenger/room/cm-room-entry-priority-mode";

const FLIGHT_KEY = "community-messenger:home:silent:home_sync";

export type FetchCommunityMessengerHomeSilentListsOpts = {
  signal?: AbortSignal;
  /** 기본 full — 홈 첫 silent는 critical 후 idle 에 full 보강 */
  tier?: "critical" | "full";
  /** true면 TTL 재생 무시하고 항상 네트워크(내부·테스트용) */
  forceNetwork?: boolean;
  /** `[home-sync-reentry].trigger` — 호출 경로 라벨(선택) */
  reentryTrigger?: string;
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

type ReplayCacheEntry = {
  /** `performance.now()` */
  completedAt: number;
  json: CommunityMessengerHomeSilentListsPayload["json"];
  status: number;
  retryAfter: string | null;
};

const lastReplayableByTier = new Map<string, ReplayCacheEntry>();
const lastCallPerfByTier = new Map<string, number>();

/** 직전 fetch 호출까지의 pathname (같은 탭) */
let silentFetchLastPathname = "";
/** pathname 문자열이 바뀐 시각(performance.now) — 라우트 안정화 창 */
let silentFetchLastPathnameChangePerf: number | null = null;
/** pathname 을 떠난 시각 — 동일 경로 왕복 debounce */
const silentPathLeftAtByPathname = new Map<string, number>();

function homeSyncUrl(tier: "critical" | "full"): string {
  return tier === "critical"
    ? "/api/community-messenger/home-sync?tier=critical"
    : "/api/community-messenger/home-sync";
}

function pathnameForLog(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.pathname ?? "";
  } catch {
    return "";
  }
}

function replayTtlMsForTier(tier: "critical" | "full"): number {
  return tier === "critical"
    ? MESSENGER_HOME_SILENT_SYNC_CRITICAL_REPLAY_TTL_MS
    : MESSENGER_HOME_SILENT_SYNC_FULL_REPLAY_TTL_MS;
}

function pickReplaySuppressReason(args: {
  pathname: string;
  perfNow: number;
  replayAge: number;
  replayTtl: number;
}): HomeSyncSuppressReason | null {
  if (args.replayAge >= args.replayTtl) return null;
  const roundtrip =
    args.pathname !== "" &&
    silentPathLeftAtByPathname.has(args.pathname) &&
    args.perfNow - silentPathLeftAtByPathname.get(args.pathname)! <
      MESSENGER_HOME_SILENT_SYNC_PATH_ROUNDTRIP_DEBOUNCE_MS;
  if (roundtrip) return "pathname_roundtrip";
  if (
    silentFetchLastPathnameChangePerf != null &&
    args.perfNow - silentFetchLastPathnameChangePerf < MESSENGER_HOME_SILENT_SYNC_ROUTE_STABILIZE_MS
  ) {
    return "route_transition_stabilize";
  }
  return "recent_success_replay";
}

function syntheticResponseFromReplay(c: ReplayCacheEntry): CommunityMessengerHomeSilentListsPayload {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (c.retryAfter) headers.set("Retry-After", c.retryAfter);
  const body = JSON.stringify(c.json);
  const res = new Response(body, { status: c.status, headers });
  return { res, json: c.json };
}

function silentHomeSyncFlightKey(tier: "critical" | "full"): string {
  return `${FLIGHT_KEY}:${tier}`;
}

export type InvalidateCommunityMessengerHomeSilentListsReplayOpts = {
  /** 기본 `full` — mark_read 후 stale full-tier list replay 차단 */
  tier?: "critical" | "full" | "all";
};

/**
 * mark_read 직후 pre-read full-tier replay 가 silent supplement 로 재주입되지 않게 한다 (RC-2α).
 * critical replay·TTL 은 유지한다.
 */
export function invalidateCommunityMessengerHomeSilentListsReplay(
  opts: InvalidateCommunityMessengerHomeSilentListsReplayOpts = {}
): void {
  const tier = opts.tier ?? "full";
  if (tier === "all") {
    lastReplayableByTier.delete(silentHomeSyncFlightKey("critical"));
    lastReplayableByTier.delete(silentHomeSyncFlightKey("full"));
    return;
  }
  lastReplayableByTier.delete(silentHomeSyncFlightKey(tier));
}

/** 테스트·수동: TTL 캐시 + 단일 비행 키 정리 */
export function resetCommunityMessengerHomeSilentListsClientStateForTests(): void {
  lastReplayableByTier.clear();
  lastCallPerfByTier.clear();
  silentFetchLastPathname = "";
  silentFetchLastPathnameChangePerf = null;
  silentPathLeftAtByPathname.clear();
}

/**
 * `signal` 은 **HTTP fetch 에 전달하지 않음** — 상위 `refresh()` 의 `abort()` 가
 * 네트워크를 끊지 않게 해 0B 중복·재오픈을 줄인다. tier별 `runSingleFlight` + TTL 재생 유지.
 */
export function fetchCommunityMessengerHomeSilentLists(
  opts: FetchCommunityMessengerHomeSilentListsOpts = {}
): Promise<CommunityMessengerHomeSilentListsPayload> {
  void opts.signal;
  if (shouldDeferHomeSyncStart()) {
    return new Promise((resolve, reject) => {
      deferHomeSyncFetch(() => {
        fetchCommunityMessengerHomeSilentLists(opts).then(resolve).catch(reject);
      });
    });
  }
  const tier = opts.tier ?? "full";
  const flightKey = silentHomeSyncFlightKey(tier);
  const url = homeSyncUrl(tier);
  const pathname = pathnameForLog();
  const previous_pathname = silentFetchLastPathname;
  const perfNow = typeof performance !== "undefined" ? performance.now() : 0;

  if (pathname !== silentFetchLastPathname) {
    if (silentFetchLastPathname !== "") {
      silentPathLeftAtByPathname.set(silentFetchLastPathname, perfNow);
    }
    silentFetchLastPathnameChangePerf = perfNow;
  }
  silentFetchLastPathname = pathname;

  const trigger = opts.reentryTrigger ?? "silent_lists_fetch";
  const prevPerf = lastCallPerfByTier.get(flightKey);
  lastCallPerfByTier.set(flightKey, perfNow);
  const requestAgeMs =
    typeof performance !== "undefined" && prevPerf != null ? Math.max(0, Math.round(perfNow - prevPerf)) : 0;

  const inflight = getSingleFlightPromise<CommunityMessengerHomeSilentListsPayload>(flightKey);
  if (inflight) {
    logHomeSyncReentry({
      trigger,
      pathname,
      had_inflight: true,
      aborted_previous: false,
      request_age_ms: requestAgeMs,
      reused_existing: true,
      skipped_duplicate: false,
      tier,
    });
    return inflight;
  }

  const replayTtl = replayTtlMsForTier(tier);
  if (!opts.forceNetwork && typeof performance !== "undefined") {
    const replay = lastReplayableByTier.get(flightKey);
    if (replay) {
      const replayAge = perfNow - replay.completedAt;
      const reason = pickReplaySuppressReason({ pathname, perfNow, replayAge, replayTtl });
      if (reason) {
        if (reason === "pathname_roundtrip" && pathname !== "") {
          silentPathLeftAtByPathname.delete(pathname);
        }
        logHomeSyncReentry({
          trigger,
          pathname,
          had_inflight: false,
          aborted_previous: false,
          request_age_ms: requestAgeMs,
          reused_existing: true,
          skipped_duplicate: true,
          tier,
        });
        logHomeSyncSuppress({
          suppressed: true,
          reason,
          age_ms: Math.round(replayAge * 10) / 10,
          pathname,
          previous_pathname,
          reused_snapshot: true,
          cooldown_ms: replayTtl,
          tier,
        });
        recordMessengerHomeHomeSyncReplaySyntheticReturn(reason);
        return Promise.resolve(syntheticResponseFromReplay(replay));
      }
    }
  }

  logHomeSyncReentry({
    trigger,
    pathname,
    had_inflight: false,
    aborted_previous: false,
    request_age_ms: requestAgeMs,
    reused_existing: false,
    skipped_duplicate: false,
    tier,
  });

  return runSingleFlight(flightKey, async () => {
    noteHomeSyncInflightDuringEntry(true);
    recordMessengerHomeHomeSyncNetworkFetch();
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
    const res = await fetch(url, {
      cache: "default",
      credentials: "include",
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
    if (res.ok && json?.ok !== false) {
      lastReplayableByTier.set(flightKey, {
        completedAt: typeof performance !== "undefined" ? performance.now() : Date.now(),
        json,
        status: res.status,
        retryAfter: res.headers.get("Retry-After"),
      });
    } else {
      lastReplayableByTier.delete(flightKey);
    }
    return { res, json };
    } finally {
      noteHomeSyncInflightDuringEntry(false);
    }
  });
}
