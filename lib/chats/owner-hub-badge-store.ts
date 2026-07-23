/**

 * 매장 오너 허브 배지 — 전역 단일 폴링·fetch.

 * (BottomNav + StoresHub 등) 여러 컴포넌트가 구독해도 GET /api/me/store-owner-hub-badge 는 한 갈래만 나감

 * (서버 TTL 캐시 `owner-hub-badge-cache`). `/unreads`·`/store-attention` 세그먼트는 동일 집계 로직 분리용.

 */

import {

  OWNER_HUB_BADGE_EMPTY,

  parseOwnerHubBadgeJson,

  sameOwnerHubBadge,

  type OwnerHubBadgeBreakdown,

} from "@/lib/chats/owner-hub-badge-types";

import { isStoreOwnerAdminPathname } from "@/lib/business/owner-hub-path";
import { OWNER_DASHBOARD_API_PRIORITY } from "@/lib/business/owner-dashboard-api-priority";
import {
  trackOwnerDashboardApiDone,
  trackOwnerDashboardApiStart,
} from "@/lib/business/owner-dashboard-waterfall";

import {

  KASAMA_OWNER_HUB_BADGE_REFRESH,

  KASAMA_TRADE_CHAT_UNREAD_UPDATED,

} from "@/lib/chats/chat-channel-events";

import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";

import {

  cancelScheduledWhenBrowserIdle,

  isConstrainedNetwork,

  scheduleWhenBrowserIdle,

} from "@/lib/ui/network-policy";

import {

  SAMARKET_OWNER_HUB_BADGE_LEADER_SCOPE,

  SAMARKET_OWNER_HUB_BADGE_SYNC_CHANNEL,

  subscribeTabLeader,

} from "@/lib/runtime/leader-tab-coordinator";

import { recordBootVerifyFetch } from "@/lib/app-boot/client-boot-request-journal";

import { isAppBootReady } from "@/lib/app-boot/app-boot-store";

import { samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";

import { logNetworkLoopGuard, logNetworkLoopGuardBlocked } from "@/lib/dev/network-loop-guard";
import { logFetchTrace, logPollingTrace } from "@/lib/dibay/network-fetch-storm-trace";
import {
  logHubBadgeLoopTrace,
  logHubBadgeRenderTrace,
  logHubBadgeScheduleTrace,
  logShellFetchTrace,
} from "@/lib/dibay/shell-fetch-trace";

import { logHubRefreshGuard, logMarkReadRefreshChain, logParticipantUnreadHubRefresh } from "@/lib/chats/hub-refresh-guard";

import { runDevSafeSingleFlight } from "@/lib/dev/dev-safe-dedupe";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";
import {
  applyHubBadgeProjection,
  registerHubBadgeProjectionSink,
  __resetHubBadgeProjectionForTest,
  type HubBadgeProjectionSnapshot,
} from "@/lib/chat-domain/projections/hub-badge-projection";
import type { HubBadgeProjectionSourceKind } from "@/lib/chat-domain/projections/surface-projection-types";



const PATH_FETCH_PREFIXES = [

  "/chats",

  "/community-messenger",

  "/mypage/trade/chat",

  "/philife",

  "/orders",

  "/stores/owner/orders",

  "/stores/owner/order-chat",

  "/stores/owner/inquiries",

  // 옛 경로(레거시 안전망) — 라우트 레벨 리다이렉트 직전에 일시적으로 매칭되는 경우 대비

  "/my/business/store-orders",

  "/my/business/store-order-chat",

  "/my/business/inquiries",

] as const;

/** `BottomNav`·`useOwnerHubBadgeBreakdown` 등 여러 곳에서 경로 변경 시 호출해도 한 번으로 합침 */

const HUB_PATH_REFRESH_DEBOUNCE_MS = 420;

let hubPathRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** 클라 장주기 폴링 간격 — 서버 TTL·5초 중복 방지와 별도 */

const MIN_FETCH_GAP_MS = 25_000;

/** plain 재호출 최소 간격 — 서버 TTL·클라 응답 캐시와 맞춤 */

const MIN_REPEAT_PLAIN_FETCH_GAP_MS = 20_000;

/** 첫 페인트 이후 idle 조회 시 cache_hit 유도 */

const CLIENT_HUB_BADGE_RESPONSE_TTL_MS = 25_000;

/** visibility 복귀 burst — trailing 1회 */

const HUB_BADGE_VISIBILITY_FETCH_COALESCE_MS = 900;



let clientHubBadgeResponseCache: { expiresAt: number; data: unknown } | null = null;

/** force=true 연타 시 inFlight 합류 — 거래 탭 배지·알림 즉시성과의 균형 */

const MIN_FORCE_FETCH_GAP_MS = 1_600;

const MIN_EVENT_REFRESH_GAP_MS = 5_000;

const EVENT_FORCE_REFRESH_DEBOUNCE_MS = 120;

/** 가시 탭 주기 폴링 — 포커스·이벤트 갱신과 별도 (`docs/messenger-realtime-policy.md`) */

const OWNER_HUB_BADGE_POLL_INTERVAL_MS = 180_000;

const MIN_VISIBILITY_FETCH_GAP_MS = 45_000;

/** 메신저 참가자 이벤트(source=community_messenger) 강제 갱신 최소 간격 */

const MESSENGER_PARTICIPANT_FORCE_REFRESH_MIN_GAP_MS = 5_000;

/** 메신저 이벤트에서도 최근 배지 스냅샷이 신선하면 `cmFresh=1` 강제를 피한다. */

const MESSENGER_PARTICIPANT_FORCE_STALE_MS = 30_000;

/** mark_read 직후 hub badge — 동일 burst·room collapse 창 */

const MESSENGER_MARK_READ_HUB_COLLAPSE_MS = 4_000;

const MESSENGER_MARK_READ_HUB_COALESCE_DELAY_MS = 48;

/** 직전 hub fetch 가 신선하면 cmFresh bypass·aggregate 재계산 생략(서버는 mark_read 시 invalidate) */

const MESSENGER_MARK_READ_HUB_BYPASS_BLOCK_MS = 5_000;

/** participant unread 감소(읽음 ack) — room 단위 hub refresh collapse */

const PARTICIPANT_UNREAD_ROOM_DEDUPE_MS = 4_000;

/** fresh cmFresh·optimistic 이후 stale broadcast/cache 가 cm 을 내리지 못하게 하는 창 */

const CM_UNREAD_STALE_DOWNGRADE_GUARD_MS = 45_000;



type HubBadgeApplySource = { kind: HubBadgeProjectionSourceKind };



let snapshot: OwnerHubBadgeBreakdown = OWNER_HUB_BADGE_EMPTY;

let lastNetworkFreshCommunityMessengerUnread = 0;

let lastNetworkFreshCommunityMessengerUnreadAt = 0;

const listeners = new Set<() => void>();



let pollInterval: ReturnType<typeof setInterval> | null = null;

/** React Strict Mode·탭 전환: 리스너가 잠깐 0이 될 때 stopHub/startHub·listener 중복 등록 완화 */

const HUB_STOP_DEBOUNCE_MS = 120;

let hubStopTimer: ReturnType<typeof setTimeout> | null = null;

let globalEventsAttachCount = 0;

let initialHydrateIdleId: number | null = null;

let hubStarted = false;

let globalEventsAttached = false;

let lastFetchStartedAt = 0;

let lastFetchCompletedAt = 0;

let lastPlainFetchCompletedAt = 0;

let lastEventRefreshAt = 0;

let eventForceRefreshTimer: ReturnType<typeof setTimeout> | null = null;

/** 메신저 `community_messenger_participants` unread — 5초 이벤트 갭·일반 허브 스케줄과 분리해 탭 배지 즉시성 */

let messengerHubBadgeCoalesceTimer: ReturnType<typeof setTimeout> | null = null;

let lastMessengerParticipantForceRefreshAt = 0;

let markReadHubCoalesceTimer: ReturnType<typeof setTimeout> | null = null;

let pendingMarkReadHubDetail: { source?: string; key?: string; roomId?: string; at?: number } | null = null;

let lastMarkReadHubNetworkAt = 0;

const lastParticipantDecreaseHubRefreshByRoom = new Map<string, number>();

/** App Boot background 전까지 HTTP fetch 금지 — BottomNav 구독만 허용 */

let hubBadgeBackgroundEnabled = false;

/** 라우트 전환·idle 취소용 — bump 시 pending rAF/idle fetch 폐기 */

let hubBadgeScheduleGeneration = 0;



export function enableOwnerHubBadgeBackgroundHydration(): void {

  hubBadgeBackgroundEnabled = true;

  if (listeners.size > 0 && !shouldDeferHubBadgeOnStoreOwnerAdmin()) startHub();

}

/** 허브·매장 설정 등 `/stores/owner*` — 첫 페인트에 배지 API 가 경쟁하지 않도록 */
function shouldDeferHubBadgeOnStoreOwnerAdmin(): boolean {
  return typeof window !== "undefined" && isStoreOwnerAdminPathname();
}



function emit() {

  logHubBadgeRenderTrace([`listeners:${listeners.size}`]);

  for (const l of listeners) l();

}



function recalcHubBadgeTotal(bd: OwnerHubBadgeBreakdown): number {

  return (

    Math.max(0, bd.socialChatUnread) +

    Math.max(0, bd.storesTabAttention) +

    Math.max(0, bd.communityMessengerUnread)

  );

}



function guardStaleCommunityMessengerUnread(

  next: OwnerHubBadgeBreakdown,

  source: HubBadgeApplySource

): OwnerHubBadgeBreakdown {

  if (source.kind === "network_fresh" || source.kind === "optimistic") return next;



  const incomingCm = Math.max(0, Math.floor(Number(next.communityMessengerUnread) || 0));

  const currentCm = Math.max(0, Math.floor(Number(snapshot.communityMessengerUnread) || 0));

  const freshCm = Math.max(0, Math.floor(Number(lastNetworkFreshCommunityMessengerUnread) || 0));

  const freshAge = Date.now() - lastNetworkFreshCommunityMessengerUnreadAt;

  const freshGuardActive =

    lastNetworkFreshCommunityMessengerUnreadAt > 0 && freshAge < CM_UNREAD_STALE_DOWNGRADE_GUARD_MS;



  if (!freshGuardActive) {

    if (

      (source.kind === "broadcast" ||

        source.kind === "client_cache" ||

        source.kind === "network_plain") &&

      incomingCm > currentCm

    ) {

      return {

        ...next,

        communityMessengerUnread: incomingCm,

        total: recalcHubBadgeTotal({ ...next, communityMessengerUnread: incomingCm }),

      };

    }

    return next;

  }



  const authoritativeCm = Math.max(currentCm, freshCm);

  if (incomingCm >= authoritativeCm) return next;



  return {

    ...next,

    communityMessengerUnread: authoritativeCm,

    total: recalcHubBadgeTotal({ ...next, communityMessengerUnread: authoritativeCm }),

  };

}



function noteNetworkFreshCommunityMessengerUnread(cm: number): void {

  lastNetworkFreshCommunityMessengerUnread = Math.max(0, Math.floor(Number(cm) || 0));

  lastNetworkFreshCommunityMessengerUnreadAt = Date.now();

}



/**
 * Funnel every hub surface write through Phase H applyHubBadgeProjection.
 * Sink (below) owns stale-CM guard + emit.
 */
function applyOwnerHubBadgePayload(data: unknown, source: HubBadgeApplySource): void {
  const parsed = parseOwnerHubBadgeJson(data);
  applyHubBadgeProjection({
    breakdown: parsed,
    versionMs: Date.now(),
    source: source.kind,
    totalUnread: Math.max(0, parsed.total),
  });
}

/** Projection sink — sole mutator of hub snapshot after cutover slice-1. */
function sinkOwnerHubBadgeFromProjection(proj: HubBadgeProjectionSnapshot): void {
  const source: HubBadgeApplySource = { kind: proj.source };
  const next = guardStaleCommunityMessengerUnread(proj.breakdown, source);

  if (source.kind === "network_fresh" || source.kind === "optimistic") {
    noteNetworkFreshCommunityMessengerUnread(next.communityMessengerUnread);
  }

  if (sameOwnerHubBadge(snapshot, next)) return;

  snapshot = next;
  emit();
}

registerHubBadgeProjectionSink(sinkOwnerHubBadgeFromProjection);



function maybeScheduleCmFreshVerifyAfterZeroCache(

  source: string,

  opts?: FetchOwnerHubBadgeNowOptions

): void {

  if (Math.max(0, snapshot.communityMessengerUnread) > 0) return;

  const now = Date.now();

  if (now - lastFetchStartedAt < MIN_FORCE_FETCH_GAP_MS) return;

  ensureOwnerHubLeaderAndSync();

  const verifyOpts: FetchOwnerHubBadgeNowOptions = {

    ...opts,

    serverHubBadgeBypass: true,

    allowImmediateUserAction: true,

    callerComponent: opts?.callerComponent ?? "cm_fresh_verify",

  };

  if (isLeaderOwnerHubBadgeRef.current) {

    void fetchOwnerHubBadgeNow(true, verifyOpts);

    return;

  }

  postOwnerHubBadgeRefreshRequest(true);

  scheduleDeferredHubBadgeFetch(`${source}_cm_fresh_verify`, true, verifyOpts);

}



function applyFromNetwork(data: unknown) {

  applyOwnerHubBadgePayload(data, { kind: "network_plain" });

}



export function applyCommunityMessengerUnreadOptimistic(unread: number): void {
  /**
   * R1 QUARANTINED / dead — measurement 2026-07-23 removed sole product caller.
   * Kept as no-op export so accidental imports fail closed (no store write).
   * Live Bottom Chat: use applyHubBadgeCmUnreadRoomCountAbsolute (room-count recount).
   */
  void unread;
}

/**
 * Bottom Chat room-count absolute via Phase H projection (optimistic).
 * Callers pass GD+group unread-room recount from messenger-room-unread-authority.
 * Network resync remains authority. DO NOT: revive ±1 delta · R1 · Bell · Native Call.
 */
export function applyHubBadgeCmUnreadRoomCountAbsolute(roomCount: number): void {
  const nextCm = Math.max(0, Math.floor(Number(roomCount) || 0));
  const next: OwnerHubBadgeBreakdown = {
    ...snapshot,
    communityMessengerUnread: nextCm,
    total: recalcHubBadgeTotal({ ...snapshot, communityMessengerUnread: nextCm }),
  };
  applyHubBadgeProjection({
    breakdown: next,
    versionMs: Date.now(),
    source: "optimistic",
    totalUnread: Math.max(0, next.total),
  });
}



const HUB_BADGE_FLIGHT_KEY = "me:store-owner-hub-badge";



let ownerHubLeaderUnsub: (() => void) | null = null;

let ownerHubSyncBc: BroadcastChannel | null = null;

let ownerHubSyncOnMessage: ((ev: MessageEvent) => void) | null = null;

const isLeaderOwnerHubBadgeRef = { current: false };



function broadcastOwnerHubBadgeSnapshot(data: unknown) {

  if (!ownerHubSyncBc) return;

  try {

    ownerHubSyncBc.postMessage({ v: 1 as const, type: "snapshot" as const, data });

  } catch {

    /* ignore */

  }

}



function broadcastAppliedOwnerHubBadgeSnapshot(): void {

  broadcastOwnerHubBadgeSnapshot({ ok: true, ...getOwnerHubBadgeSnapshot() });

}



function postOwnerHubBadgeRefreshRequest(force: boolean) {

  if (!ownerHubSyncBc) return;

  try {

    ownerHubSyncBc.postMessage({ v: 1 as const, type: "request" as const, force, at: Date.now() });

  } catch {

    /* ignore */

  }

}



function ensureOwnerHubLeaderAndSync() {

  if (typeof window === "undefined") return;

  if (ownerHubLeaderUnsub) return;

  ownerHubLeaderUnsub = subscribeTabLeader(SAMARKET_OWNER_HUB_BADGE_LEADER_SCOPE, (leader) => {

    isLeaderOwnerHubBadgeRef.current = leader;

  });

  try {

    ownerHubSyncBc = new BroadcastChannel(SAMARKET_OWNER_HUB_BADGE_SYNC_CHANNEL);

  } catch {

    ownerHubSyncBc = null;

  }

  ownerHubSyncOnMessage = (ev: MessageEvent) => {

    const d = ev.data as {

      v?: number;

      type?: string;

      data?: unknown;

      force?: boolean;

      at?: number;

    };

    if (!d || d.v !== 1) return;

    if (d.type === "snapshot") {

      applyOwnerHubBadgePayload(d.data ?? null, { kind: "broadcast" });

      return;

    }

    if (d.type === "request" && isLeaderOwnerHubBadgeRef.current) {

      const force = d.force === true;

      const now = Date.now();

      const leaderSyncGapMs = force ? MIN_FORCE_FETCH_GAP_MS : MIN_EVENT_REFRESH_GAP_MS;

      if (now - lastEventRefreshAt < leaderSyncGapMs) {

        logHubBadgeLoopTrace({ reason: "leader_tab_sync_gap_skip" });

        logHubBadgeScheduleTrace({

          source: "leader_tab_sync",

          skipped: true,

          ttlHit: true,

        });

        return;

      }

      lastEventRefreshAt = now;

      logHubBadgeLoopTrace({ reason: force ? "leader_tab_sync_force" : "leader_tab_sync_plain" });

      scheduleDeferredHubBadgeFetch("leader_tab_sync", force, {

        callerComponent: "owner_hub_badge_leader",

      });

    }

  };

  ownerHubSyncBc?.addEventListener("message", ownerHubSyncOnMessage);

}



function teardownOwnerHubLeaderAndSync() {

  ownerHubLeaderUnsub?.();

  ownerHubLeaderUnsub = null;

  isLeaderOwnerHubBadgeRef.current = false;

  if (ownerHubSyncBc && ownerHubSyncOnMessage) {

    ownerHubSyncBc.removeEventListener("message", ownerHubSyncOnMessage);

  }

  ownerHubSyncOnMessage = null;

  try {

    ownerHubSyncBc?.close();

  } catch {

    /* ignore */

  }

  ownerHubSyncBc = null;

}



export type FetchOwnerHubBadgeNowOptions = {

  /** dev-safe: 허브 GET 장주기 스로틀(plain 45s / cmFresh 15s)을 끔 — 명시 새로고침·버튼 등 */

  skipDevCmFreshDedupe?: boolean;

  /** 서버 `hubBadgeBypass=1` — dev-safe 에서 cmFresh 시 짧은 캐시 우회(읽음 직후 등) */

  serverHubBadgeBypass?: boolean;

  /** 읽음 직후 등 — boot·background gate 우회(여전히 deferred 헤더·idle 스케줄은 유지) */

  allowImmediateUserAction?: boolean;

  callerComponent?: string;

  /** mark_read ack 직후 plain 허용·완료 시각 기록 */

  markReadAck?: boolean;

  routeTransitionSource?: string;

};



function hubBadgeLeaderFetchUrl(force: boolean, serverHubBadgeBypass?: boolean): string {

  if (!force) return "/api/me/store-owner-hub-badge";

  const q = new URLSearchParams();

  q.set("cmFresh", "1");

  if (serverHubBadgeBypass) q.set("hubBadgeBypass", "1");

  return `/api/me/store-owner-hub-badge?${q.toString()}`;

}



function buildHubBadgeFetchHeaders(opts?: FetchOwnerHubBadgeNowOptions): HeadersInit {

  const h: Record<string, string> = {

    "x-samarket-hub-badge-deferred": "1",

    "x-samarket-first-paint-blocking": "0",

    "x-samarket-client-call-source": "owner_hub_badge_store",

  };

  if (opts?.callerComponent) {

    h["x-samarket-caller-component"] = opts.callerComponent.slice(0, 64);

  }

  if (opts?.routeTransitionSource) {

    h["x-samarket-route-transition-source"] = opts.routeTransitionSource.slice(0, 120);

  }

  return h;

}



function peekClientHubBadgeResponseCache(): unknown | null {

  if (!clientHubBadgeResponseCache || clientHubBadgeResponseCache.expiresAt <= Date.now()) {

    clientHubBadgeResponseCache = null;

    return null;

  }

  return clientHubBadgeResponseCache.data;

}



function storeClientHubBadgeResponseCache(data: unknown): void {

  clientHubBadgeResponseCache = { data, expiresAt: Date.now() + CLIENT_HUB_BADGE_RESPONSE_TTL_MS };

}



function canIssueHubBadgeNetworkFetch(force: boolean, opts?: FetchOwnerHubBadgeNowOptions): boolean {

  if (typeof window === "undefined") return false;

  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;

  if (!opts?.allowImmediateUserAction) {

    if (!hubBadgeBackgroundEnabled) return false;

    if (!isAppBootReady()) return false;

  }

  return true;

}



/** 라우트 전환·탭 숨김 시 pending idle/rAF fetch 취소 */

export function cancelPendingOwnerHubBadgeFetch(reason = "route_transition"): void {

  hubBadgeScheduleGeneration += 1;

  if (hubPathRefreshTimer != null) {

    clearTimeout(hubPathRefreshTimer);

    hubPathRefreshTimer = null;

  }

  if (eventForceRefreshTimer != null) {

    clearTimeout(eventForceRefreshTimer);

    eventForceRefreshTimer = null;

  }

  if (markReadHubCoalesceTimer != null) {

    clearTimeout(markReadHubCoalesceTimer);

    markReadHubCoalesceTimer = null;

  }

  pendingMarkReadHubDetail = null;

  samarketRuntimeDebugLog("owner-hub-badge", "cancel pending fetch", { reason });

}



function scheduleDeferredHubBadgeFetch(

  source: string,

  force = false,

  opts?: FetchOwnerHubBadgeNowOptions

): void {

  if (!canIssueHubBadgeNetworkFetch(force, opts)) {

    logHubBadgeScheduleTrace({ source, skipped: true });

    return;

  }

  if (!force && peekClientHubBadgeResponseCache() != null) {

    const cachedPayload = peekClientHubBadgeResponseCache();

    if (cachedPayload != null) {

      applyOwnerHubBadgePayload(cachedPayload, { kind: "client_cache" });

      broadcastAppliedOwnerHubBadgeSnapshot();

      maybeScheduleCmFreshVerifyAfterZeroCache(source, opts);

      logHubBadgeScheduleTrace({ source, skipped: true, ttlHit: true });

      logShellFetchTrace({

        api: "/api/me/store-owner-hub-badge",

        component: opts?.callerComponent ?? source,

        reason: "scheduleDeferredHubBadgeFetch_client_ttl_skip",

      });

      return;

    }

  }

  if (force) {

    logHubBadgeScheduleTrace({ source, skipped: false });

    logHubBadgeLoopTrace({ reason: `schedule:${source}:force_immediate` });

    if (!canIssueHubBadgeNetworkFetch(force, opts)) {

      logHubBadgeScheduleTrace({ source, skipped: true });

      return;

    }

    void fetchOwnerHubBadgeNow(force, {

      ...opts,

      callerComponent: opts?.callerComponent ?? source,

      allowImmediateUserAction: force ? true : opts?.allowImmediateUserAction,

      serverHubBadgeBypass: force ? opts?.serverHubBadgeBypass ?? true : opts?.serverHubBadgeBypass,

    });

    return;

  }

  logHubBadgeScheduleTrace({ source, skipped: false });

  logHubBadgeLoopTrace({ reason: `schedule:${source}${force ? ":force" : ""}` });

  const gen = ++hubBadgeScheduleGeneration;

  scheduleOwnerHubBadgeAfterFirstPaint(() => {

    if (gen !== hubBadgeScheduleGeneration) return;

    if (!canIssueHubBadgeNetworkFetch(force, opts)) return;

    void fetchOwnerHubBadgeNow(force, {

      ...opts,

      callerComponent: opts?.callerComponent ?? source,

    });

  });

}



function fetchOwnerHubBadgeLeaderNetwork(force: boolean, opts?: FetchOwnerHubBadgeNowOptions): Promise<boolean> {

  const hubEndpoint = hubBadgeLeaderFetchUrl(force, opts?.serverHubBadgeBypass);
  const guardCaller = opts?.callerComponent ?? "owner_hub_badge_store";
  const now = Date.now();

  if (!force) {

    const cachedPayload = peekClientHubBadgeResponseCache();

    if (cachedPayload != null) {

      applyOwnerHubBadgePayload(cachedPayload, { kind: "client_cache" });

      broadcastAppliedOwnerHubBadgeSnapshot();

      maybeScheduleCmFreshVerifyAfterZeroCache("fetchOwnerHubBadgeLeaderNetwork", opts);

      lastFetchCompletedAt = now;

      logNetworkLoopGuardBlocked({
        endpoint: hubEndpoint,
        caller: guardCaller,
        reason: "client_response_ttl",
        ttl_hit: true,
        interval_id: pollInterval,
      });

      return Promise.resolve(true);

    }

    if (now - lastPlainFetchCompletedAt < MIN_REPEAT_PLAIN_FETCH_GAP_MS) {

      logNetworkLoopGuardBlocked({
        endpoint: hubEndpoint,
        caller: guardCaller,
        reason: "min_repeat_plain_gap",
        ttl_hit: true,
        interval_id: pollInterval,
      });

      return Promise.resolve(false);

    }

  }

  if (!force && now - lastFetchStartedAt < MIN_FETCH_GAP_MS) {

    const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);

    if (inFlight) {

      logNetworkLoopGuardBlocked({
        endpoint: hubEndpoint,
        caller: guardCaller,
        reason: "single_flight_join",
        dedupe_hit: true,
        interval_id: pollInterval,
      });

      return inFlight.then(() => false);

    }

    logNetworkLoopGuardBlocked({
      endpoint: hubEndpoint,
      caller: guardCaller,
      reason: "min_fetch_gap",
      ttl_hit: true,
      interval_id: pollInterval,
    });

    return Promise.resolve(false);

  }

  if (force && now - lastFetchStartedAt < MIN_FORCE_FETCH_GAP_MS) {

    const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);

    if (inFlight) {
      logNetworkLoopGuardBlocked({
        endpoint: hubEndpoint,
        caller: guardCaller,
        reason: "single_flight_join_force",
        dedupe_hit: true,
        interval_id: pollInterval,
      });
      return inFlight.then(() => false);
    }

    /** 읽음 직후(`allowImmediateUserAction`)만 gap 우회 — 그 외 force 연속 호출은 HTTP 지연(~580ms) 루프를 만든다 */

    if (!opts?.allowImmediateUserAction) {

      logNetworkLoopGuardBlocked({
        endpoint: hubEndpoint,
        caller: guardCaller,
        reason: "min_force_fetch_gap",
        ttl_hit: true,
        interval_id: pollInterval,
      });

      logHubBadgeScheduleTrace({ source: guardCaller, skipped: true, ttlHit: true });

      return Promise.resolve(false);

    }

  }



  lastFetchStartedAt = now;

  if (force) {

    clientHubBadgeResponseCache = null;

  }



  const hubCacheHit = !force && peekClientHubBadgeResponseCache() != null ? 1 : 0;
  trackOwnerDashboardApiStart("hub_badge", {
    priority: OWNER_DASHBOARD_API_PRIORITY.hub_badge,
    cache_hit: hubCacheHit,
  });
  const wfT0 = Date.now();

  return runSingleFlight(HUB_BADGE_FLIGHT_KEY, async (): Promise<boolean> => {

    try {

      const hubUrl = hubBadgeLeaderFetchUrl(force, opts?.serverHubBadgeBypass);

      recordBootVerifyFetch(hubUrl, "owner_hub_badge_store");

      logNetworkLoopGuard({
        endpoint: hubUrl,
        caller: opts?.callerComponent ?? "owner_hub_badge_store",
        reason: force ? "fetch_force" : "fetch",
        interval_id: pollInterval,
      });
      logFetchTrace({
        api: hubUrl,
        component: opts?.callerComponent ?? "owner_hub_badge_store",
        reason: force ? "fetch_force" : "fetch",
      });
      logShellFetchTrace({
        api: "/api/me/store-owner-hub-badge",
        component: opts?.callerComponent ?? "owner_hub_badge_store",
        reason: force ? "fetch_force" : "fetch",
      });
      logHubBadgeLoopTrace({ reason: force ? "network_fetch_force" : "network_fetch_plain" });

      const res = await fetch(hubUrl, {

        credentials: "include",

        cache: "no-store",

        headers: buildHubBadgeFetchHeaders(opts),

      });

      const data = res.ok ? await res.json() : null;

      samarketRuntimeDebugLog("owner-hub-badge", "leader HTTP fetch completed", {

        ok: res.ok,

        force,

        caller: opts?.callerComponent ?? null,

      });

      if (res.ok && data != null) {

        storeClientHubBadgeResponseCache(data);

      }

      const parsed = parseOwnerHubBadgeJson(data);

      if (sameOwnerHubBadge(snapshot, parsed)) {

        logHubRefreshGuard({

          source: opts?.callerComponent ?? "owner_hub_badge_store",

          reason: force ? "fetch_force_same_snapshot" : "fetch_same_snapshot",

          snapshot_same_skip: true,

        });

        if (opts?.markReadAck) {

          logMarkReadRefreshChain({

            roomId: null,

            messageId: null,

            triggered_hub_refresh: true,

            refresh_skipped: false,

            same_snapshot: true,

            collapsed: false,

          });

        }

      }

      applyOwnerHubBadgePayload(data, { kind: force ? "network_fresh" : "network_plain" });

      broadcastAppliedOwnerHubBadgeSnapshot();

      lastFetchCompletedAt = Date.now();

      if (opts?.markReadAck) lastMarkReadHubNetworkAt = lastFetchCompletedAt;

      if (!force) lastPlainFetchCompletedAt = lastFetchCompletedAt;

      trackOwnerDashboardApiDone("hub_badge", {
        priority: OWNER_DASHBOARD_API_PRIORITY.hub_badge,
        cache_hit: hubCacheHit,
        client_duration_ms: Date.now() - wfT0,
      });

      return res.ok;

    } catch {

      applyFromNetwork(null);

      broadcastOwnerHubBadgeSnapshot(null);

      lastFetchCompletedAt = Date.now();

      trackOwnerDashboardApiDone("hub_badge", {
        priority: OWNER_DASHBOARD_API_PRIORITY.hub_badge,
        cache_hit: hubCacheHit,
        client_duration_ms: Date.now() - wfT0,
      });

      return false;

    }

  });

}



export function fetchOwnerHubBadgeNow(force = false, opts?: FetchOwnerHubBadgeNowOptions): Promise<void> {

  if (typeof window === "undefined") {

    return Promise.resolve();

  }

  if (!canIssueHubBadgeNetworkFetch(force, opts)) {

    return Promise.resolve();

  }



  ensureOwnerHubLeaderAndSync();



  if (!isLeaderOwnerHubBadgeRef.current) {

    postOwnerHubBadgeRefreshRequest(force);

    return Promise.resolve();

  }



  if (isDevSafeMode() && !opts?.skipDevCmFreshDedupe) {

    const k = force ? "owner-hub-badge:cmFresh" : "owner-hub-badge:plain";

    const ttl = force ? 15_000 : 45_000;

    return runDevSafeSingleFlight(k, ttl, () => fetchOwnerHubBadgeLeaderNetwork(force, opts), {

      onlyCacheIf: (ok) => ok === true,

    }).then(() => undefined);

  }



  return fetchOwnerHubBadgeLeaderNetwork(force, opts).then(() => undefined);

}



function onTradeUnreadUpdated() {

  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  scheduleEventDrivenOwnerHubRefresh();

}



type OwnerHubBadgeRefreshDetail = {
  source?: string;
  key?: string;
  roomId?: string;
  participantUnreadDirection?: "decrease" | "increase";
  at?: number;
};



function markReadHubCollapseKey(detail: OwnerHubBadgeRefreshDetail): string {

  const room = detail.roomId?.trim();

  if (room) return `room:${room}`;

  return detail.key?.trim() || "mark_read";

}



function executeMarkReadHubBadgeFetch(detail: OwnerHubBadgeRefreshDetail): void {

  const now = Date.now();

  const roomId = detail.roomId?.trim() || null;

  const reason = detail.key ?? "mark_read";

  if (now - lastMarkReadHubNetworkAt < MESSENGER_MARK_READ_HUB_COLLAPSE_MS) {

    logHubRefreshGuard({

      source: "messenger_mark_read",

      reason,

      dedupe_hit: true,

    });

    logMarkReadRefreshChain({

      roomId,

      messageId: null,

      triggered_hub_refresh: false,

      refresh_skipped: true,

      same_snapshot: true,

      collapsed: false,

      reason: "recent_mark_read_network",

    });

    return;

  }

  lastMessengerParticipantForceRefreshAt = now;

  // CONTRACT — mark_read ack: always network_fresh so guardStaleCommunityMessengerUnread cannot block decrease.
  const useForceFresh = true;

  scheduleDeferredHubBadgeFetch("messenger_mark_read", useForceFresh, {

    skipDevCmFreshDedupe: useForceFresh,

    serverHubBadgeBypass: useForceFresh,

    allowImmediateUserAction: true,

    callerComponent: "messenger_mark_read",

    markReadAck: true,

  });

}



function scheduleMarkReadHubBadgeRefresh(detail: OwnerHubBadgeRefreshDetail): void {

  const roomId = detail.roomId?.trim() || null;

  const reason = detail.key ?? "mark_read";

  const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);

  if (inFlight) {

    logHubRefreshGuard({

      source: "messenger_mark_read",

      reason,

      inflight_join: true,

    });

    logMarkReadRefreshChain({

      roomId,

      messageId: null,

      triggered_hub_refresh: true,

      refresh_skipped: false,

      same_snapshot: false,

      collapsed: true,

      reason: "inflight_join_followup",

    });

    void inFlight.finally(() => {

      executeMarkReadHubBadgeFetch(detail);

    });

    return;

  }

  const collapseKey = markReadHubCollapseKey(detail);

  if (markReadHubCoalesceTimer != null) {

    const pendingKey = pendingMarkReadHubDetail

      ? markReadHubCollapseKey(pendingMarkReadHubDetail)

      : collapseKey;

    if (pendingKey === collapseKey) {

      logHubRefreshGuard({

        source: "messenger_mark_read",

        reason,

        refresh_collapsed: true,

        dedupe_hit: true,

      });

      logMarkReadRefreshChain({

        roomId,

        messageId: null,

        triggered_hub_refresh: false,

        refresh_skipped: true,

        same_snapshot: false,

        collapsed: true,

        reason: "same_room_burst",

      });

      return;

    }

    pendingMarkReadHubDetail = detail;

    logHubRefreshGuard({

      source: "messenger_mark_read",

      reason,

      refresh_collapsed: true,

    });

    return;

  }

  pendingMarkReadHubDetail = detail;

  markReadHubCoalesceTimer = setTimeout(() => {

    markReadHubCoalesceTimer = null;

    const pending = pendingMarkReadHubDetail;

    pendingMarkReadHubDetail = null;

    if (pending) executeMarkReadHubBadgeFetch(pending);

  }, MESSENGER_MARK_READ_HUB_COALESCE_DELAY_MS);

}



function scheduleMessengerParticipantHubBadgeRefresh(detail?: OwnerHubBadgeRefreshDetail) {

  /**

   * source=community_messenger 는 이벤트 빈도가 높아, 이전 구현처럼 매번 `force`를 때리면

   * 하단 탭 왕복 시 `/api/me/store-owner-hub-badge?cmFresh=1` 가 연속 호출되어 체감 전환을 갉아먹는다.

   * 첫 이벤트는 즉시 반영하고, 이후 5초 창에서는 trailing 1회만 허용한다.

   * unread 감소(읽음 ack)는 mark_read 직후 hub fetch 와 겹치면 skip — 증가(새 메시지)는 즉시성 유지.

   */

  const roomId = detail?.roomId?.trim() || null;

  const direction = detail?.participantUnreadDirection;

  const reason = detail?.key ?? "participant_unread_changed";

  const now = Date.now();

  const shouldForceCmFreshForMessengerEvent = (): boolean => {

    /**
     * increase 에 cmFresh 금지 — hub counter_row SWR 이 아직 0이면 network_fresh 가
     * live absolute/optimistic CM 을 즉시 0으로 덮어 뱃지 깜빡임·소멸이 난다.
     * 증가 반영은 participant live recount 가 담당, 정합은 plain/poll.
     */
    if (direction === "increase") return false;

    if (

      reason === "home_list_merge_summary" ||

      reason === "direct_room_created" ||

      reason === "trade_chat_entry_room_ready" ||

      reason === "sender_echo_room_missing"

    ) {

      return true;

    }

    return false;

  };

  const logParticipantSkip = (extra: {
    reason: string;
    dedupe_hit?: boolean;
    same_room_skip?: boolean;
    recent_mark_read_gap_skip?: boolean;
    inflight_join?: boolean;
  }) => {

    logParticipantUnreadHubRefresh({

      event_room_id: roomId,

      event_user_id: null,

      source: "community_messenger_participant",

      reason: extra.reason,

      dedupe_hit: extra.dedupe_hit ?? false,

      same_room_skip: extra.same_room_skip ?? false,

      recent_mark_read_gap_skip: extra.recent_mark_read_gap_skip ?? false,

      cmFresh_bypass_allowed: false,

      cmFresh_bypass_blocked: false,

      hub_fetch_triggered: false,

      hub_fetch_skipped: true,

      inflight_join: extra.inflight_join ?? false,

    });

  };

  const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);

  if (inFlight) {

    logParticipantSkip({ reason: "inflight_join", inflight_join: true });

    return;

  }

  if (direction === "decrease") {

    if (now - lastMarkReadHubNetworkAt < MESSENGER_MARK_READ_HUB_BYPASS_BLOCK_MS) {

      logParticipantSkip({ reason: "recent_mark_read_network", recent_mark_read_gap_skip: true });

      return;

    }

    if (roomId) {

      const prev = lastParticipantDecreaseHubRefreshByRoom.get(roomId) ?? 0;

      if (now - prev < PARTICIPANT_UNREAD_ROOM_DEDUPE_MS) {

        logParticipantSkip({ reason: "same_room_decrease_burst", same_room_skip: true, dedupe_hit: true });

        return;

      }

      lastParticipantDecreaseHubRefreshByRoom.set(roomId, now);

    }

  }

  const recentHubFetch = now - lastFetchCompletedAt < MESSENGER_MARK_READ_HUB_BYPASS_BLOCK_MS;

  const staleEnough = now - lastFetchCompletedAt >= MESSENGER_PARTICIPANT_FORCE_STALE_MS;

  /** increase: never cmFresh (stale counter wipe). decrease/other: existing force rules. */
  const shouldForceFresh =

    direction === "increase"

      ? false

      : shouldForceCmFreshForMessengerEvent() || (staleEnough && !recentHubFetch);

  const elapsed = now - lastMessengerParticipantForceRefreshAt;

  const logParticipantTrigger = (forceFresh: boolean) => {

    logParticipantUnreadHubRefresh({

      event_room_id: roomId,

      event_user_id: null,

      source: "community_messenger_participant",

      reason,

      dedupe_hit: false,

      same_room_skip: false,

      recent_mark_read_gap_skip: false,

      cmFresh_bypass_allowed: forceFresh,

      cmFresh_bypass_blocked: recentHubFetch,

      hub_fetch_triggered: true,

      hub_fetch_skipped: false,

      inflight_join: false,

    });

  };

  if (elapsed >= MESSENGER_PARTICIPANT_FORCE_REFRESH_MIN_GAP_MS) {

    lastMessengerParticipantForceRefreshAt = now;

    if (messengerHubBadgeCoalesceTimer != null) {

      clearTimeout(messengerHubBadgeCoalesceTimer);

      messengerHubBadgeCoalesceTimer = null;

    }

    logParticipantTrigger(shouldForceFresh);

    scheduleDeferredHubBadgeFetch("community_messenger_event", shouldForceFresh, {

      callerComponent: "community_messenger_participant",

      serverHubBadgeBypass: shouldForceFresh,

      allowImmediateUserAction: shouldForceFresh,

    });

    return;

  }

  if (messengerHubBadgeCoalesceTimer != null) return;

  messengerHubBadgeCoalesceTimer = setTimeout(() => {

    messengerHubBadgeCoalesceTimer = null;

    lastMessengerParticipantForceRefreshAt = Date.now();

    const trailingRecentHubFetch =

      Date.now() - lastFetchCompletedAt < MESSENGER_MARK_READ_HUB_BYPASS_BLOCK_MS;

    const trailingShouldForceFresh =

      direction === "increase"

        ? false

        : shouldForceCmFreshForMessengerEvent() ||

          (Date.now() - lastFetchCompletedAt >= MESSENGER_PARTICIPANT_FORCE_STALE_MS &&

            !trailingRecentHubFetch);

    logParticipantTrigger(trailingShouldForceFresh);

    scheduleDeferredHubBadgeFetch("community_messenger_event_trailing", trailingShouldForceFresh, {

      callerComponent: "community_messenger_participant",

      serverHubBadgeBypass: trailingShouldForceFresh,

      allowImmediateUserAction: trailingShouldForceFresh,

    });

  }, MESSENGER_PARTICIPANT_FORCE_REFRESH_MIN_GAP_MS - elapsed);

}



function onOwnerHubRefresh(ev?: Event) {

  const detail = (ev as CustomEvent<OwnerHubBadgeRefreshDetail> | undefined)?.detail;

  if (detail?.source === "community_messenger") {

    /**

     * 일반 participant 이벤트는 짧은 간격·비-force 로 왕복을 줄인다.

     * 방 안 읽음 처리 직후에는 `fetchOwnerHubBadgeNow(false)` 가 22s MIN_FETCH_GAP 에 걸려

     * 탭 배지가 안 줄어드는 경우가 있어 mark_read 계열만 즉시 `cmFresh=1` 조회한다.

     */

    const immediateFresh =

      detail.key === "room_open_mark_read" ||

      detail.key === "room_phase2_mark_read";

    if (immediateFresh) {

      scheduleMarkReadHubBadgeRefresh(detail);

      return;

    }

    scheduleMessengerParticipantHubBadgeRefresh(detail);

    return;

  }

  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  scheduleEventDrivenOwnerHubRefresh();

}



function scheduleEventDrivenOwnerHubRefresh() {

  const now = Date.now();

  if (now - lastEventRefreshAt < MIN_EVENT_REFRESH_GAP_MS) return;

  lastEventRefreshAt = now;

  if (eventForceRefreshTimer != null) {

    clearTimeout(eventForceRefreshTimer);

  }

  eventForceRefreshTimer = setTimeout(() => {

    eventForceRefreshTimer = null;

    scheduleDeferredHubBadgeFetch("hub_badge_refresh_event", false, {

      callerComponent: "KASAMA_OWNER_HUB_BADGE_REFRESH",

    });

  }, EVENT_FORCE_REFRESH_DEBOUNCE_MS);

}



const coalescedHubVisibilityFetch = createTrailingCoalescedCallback(() => {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  if (Date.now() - lastFetchStartedAt < MIN_VISIBILITY_FETCH_GAP_MS) return;
  logHubBadgeLoopTrace({ reason: "visibility_visible" });
  scheduleDeferredHubBadgeFetch("visibility_visible", false, {
    callerComponent: "document_visibility",
  });
}, HUB_BADGE_VISIBILITY_FETCH_COALESCE_MS);

function onVisibility() {

  if (typeof document === "undefined") return;

  if (isDevSafeMode()) {

    if (pollInterval) {

      clearInterval(pollInterval);

      pollInterval = null;

    }

    return;

  }

  if (document.visibilityState === "visible") {

    coalescedHubVisibilityFetch.schedule();

    if (hubStarted && pollInterval == null) {

      const createdAt = Date.now();
      pollInterval = setInterval(() => {

        if (typeof document !== "undefined" && document.visibilityState === "visible") {

          scheduleDeferredHubBadgeFetch("poll_interval", false, {

            callerComponent: "owner_hub_badge_poll",

          });

        }

      }, OWNER_HUB_BADGE_POLL_INTERVAL_MS);
      logPollingTrace({
        api: "/api/me/store-owner-hub-badge",
        intervalMs: OWNER_HUB_BADGE_POLL_INTERVAL_MS,
        createdAt,
        cleanup: false,
        caller: "owner_hub_badge_visibility",
      });

    }

  } else {
    coalescedHubVisibilityFetch.cancel();
    if (pollInterval) {

    logPollingTrace({
      api: "/api/me/store-owner-hub-badge",
      intervalMs: OWNER_HUB_BADGE_POLL_INTERVAL_MS,
      createdAt: Date.now(),
      cleanup: true,
      caller: "owner_hub_badge_visibility",
    });
    clearInterval(pollInterval);

    pollInterval = null;

    cancelPendingOwnerHubBadgeFetch("visibility_hidden");

    }
  }

}



function attachGlobalEventsOnce() {

  if (globalEventsAttached) {

    logHubBadgeLoopTrace({ reason: "attach_global_events_skip_duplicate" });

    return;

  }

  globalEventsAttached = true;

  globalEventsAttachCount += 1;

  logHubBadgeLoopTrace({ reason: `attach_global_events:${globalEventsAttachCount}` });

  ensureOwnerHubLeaderAndSync();

  window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onTradeUnreadUpdated);

  window.addEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onOwnerHubRefresh);

  document.addEventListener("visibilitychange", onVisibility);

}



function detachGlobalEvents() {

  if (!globalEventsAttached) return;

  globalEventsAttached = false;

  logHubBadgeLoopTrace({ reason: "detach_global_events" });

  window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onTradeUnreadUpdated);

  window.removeEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onOwnerHubRefresh);

  document.removeEventListener("visibilitychange", onVisibility);

}



function stopHub() {

  hubStarted = false;

  logHubBadgeLoopTrace({ reason: "stop_hub" });

  cancelPendingOwnerHubBadgeFetch("stop_hub");

  if (initialHydrateIdleId != null) {

    cancelScheduledWhenBrowserIdle(initialHydrateIdleId);

    initialHydrateIdleId = null;

  }

  if (pollInterval != null) {

    logPollingTrace({
      api: "/api/me/store-owner-hub-badge",
      intervalMs: OWNER_HUB_BADGE_POLL_INTERVAL_MS,
      createdAt: Date.now(),
      cleanup: true,
      caller: "owner_hub_badge_stop_hub",
    });
    clearInterval(pollInterval);

    pollInterval = null;

  }

  if (eventForceRefreshTimer != null) {

    clearTimeout(eventForceRefreshTimer);

    eventForceRefreshTimer = null;

  }

  if (messengerHubBadgeCoalesceTimer != null) {

    clearTimeout(messengerHubBadgeCoalesceTimer);

    messengerHubBadgeCoalesceTimer = null;

  }

  detachGlobalEvents();

  teardownOwnerHubLeaderAndSync();

}



function scheduleOwnerHubBadgeAfterFirstPaint(run: () => void): void {

  if (typeof window === "undefined") return;

  if (typeof requestAnimationFrame === "function") {

    requestAnimationFrame(() => {

      requestAnimationFrame(() => {

        if (typeof requestIdleCallback === "function") {

          requestIdleCallback(() => run(), { timeout: 2500 });

        } else {

          window.setTimeout(run, 0);

        }

      });

    });

    return;

  }

  initialHydrateIdleId = scheduleWhenBrowserIdle(run, isConstrainedNetwork() ? 2600 : 800);

}



function startHub() {

  if (!hubBadgeBackgroundEnabled) return;

  if (hubStarted) return;

  if (shouldDeferHubBadgeOnStoreOwnerAdmin()) return;

  hubStarted = true;

  logHubBadgeLoopTrace({ reason: "start_hub" });

  attachGlobalEventsOnce();

  if (initialHydrateIdleId != null) {

    cancelScheduledWhenBrowserIdle(initialHydrateIdleId);

    initialHydrateIdleId = null;

  }

  if (typeof document === "undefined" || document.visibilityState === "visible") {

    scheduleDeferredHubBadgeFetch("start_hub_initial", false, {

      callerComponent: "owner_hub_badge_start_hub",

    });

  }

  if (typeof document === "undefined" || document.visibilityState === "visible") {

    if (pollInterval == null) {
      const createdAt = Date.now();
      pollInterval = setInterval(() => {

        if (typeof document !== "undefined" && document.visibilityState === "visible") {

          scheduleDeferredHubBadgeFetch("poll_interval", false, {

            callerComponent: "owner_hub_badge_poll",

          });

        }

      }, OWNER_HUB_BADGE_POLL_INTERVAL_MS);
      logPollingTrace({
        api: "/api/me/store-owner-hub-badge",
        intervalMs: OWNER_HUB_BADGE_POLL_INTERVAL_MS,
        createdAt,
        cleanup: false,
        caller: "owner_hub_badge_start_hub",
      });
    }

  }

}



export function subscribeOwnerHubBadge(listener: () => void) {

  if (hubStopTimer != null) {

    clearTimeout(hubStopTimer);

    hubStopTimer = null;

  }

  listeners.add(listener);

  if (!shouldDeferHubBadgeOnStoreOwnerAdmin()) {
    startHub();
  }

  return () => {

    listeners.delete(listener);

    if (listeners.size > 0) return;

    if (hubStopTimer != null) clearTimeout(hubStopTimer);

    hubStopTimer = setTimeout(() => {

      hubStopTimer = null;

      if (listeners.size > 0) return;

      stopHub();

    }, HUB_STOP_DEBOUNCE_MS);

  };

}



export function getOwnerHubBadgeSnapshot() {

  return snapshot;

}



export function getOwnerHubBadgeServerSnapshot() {

  return OWNER_HUB_BADGE_EMPTY;

}



/** 채팅·주문·문의 화면 진입 시 한 번 더 갱신 — 호출부마다 타이머를 두지 않고 스토어에서만 디바운스 */

export function refreshOwnerHubBadgeIfHubPath(pathname: string | null) {

  if (typeof window === "undefined") return;



  cancelPendingOwnerHubBadgeFetch("pathname_change");



  const onHub =

    Boolean(pathname) && PATH_FETCH_PREFIXES.some((p) => (pathname as string).startsWith(p));



  if (!onHub) {

    if (hubPathRefreshTimer != null) {

      clearTimeout(hubPathRefreshTimer);

      hubPathRefreshTimer = null;

    }

    return;

  }



  if (hubPathRefreshTimer != null) {

    clearTimeout(hubPathRefreshTimer);

    hubPathRefreshTimer = null;

  }

  hubPathRefreshTimer = setTimeout(() => {

    hubPathRefreshTimer = null;

    const messengerPath = Boolean(pathname?.startsWith("/community-messenger"));

    if (messengerPath) {

      void fetchOwnerHubBadgeNow(true, {

        serverHubBadgeBypass: true,

        allowImmediateUserAction: true,

        callerComponent: "OwnerHubBadgeRuntime",

        routeTransitionSource: pathname ?? undefined,

      });

      return;

    }

    scheduleDeferredHubBadgeFetch("hub_path_refresh", false, {

      callerComponent: "OwnerHubBadgeRuntime",

      routeTransitionSource: pathname ?? undefined,

    });

  }, HUB_PATH_REFRESH_DEBOUNCE_MS);

}



/** @internal vitest — owner hub badge store cm sync contract */

export function __resetOwnerHubBadgeStoreForTest(): void {

  snapshot = OWNER_HUB_BADGE_EMPTY;

  lastNetworkFreshCommunityMessengerUnread = 0;

  lastNetworkFreshCommunityMessengerUnreadAt = 0;

  clientHubBadgeResponseCache = null;

  __resetHubBadgeProjectionForTest();

}



/** @internal vitest — apply hub payload with explicit source */

export function __testApplyOwnerHubBadgePayloadForTest(

  data: unknown,

  source: HubBadgeApplySource["kind"]

): void {

  applyOwnerHubBadgePayload(data, { kind: source });

}

/** Domain badge authority → Hub surfaces (trade/order/bottom). Projection Apply only. */
export function applyDomainAuthorityHubBadgeOptimistic(input: {
  communityMessengerUnread: number;
  tradeUnread: number;
  storeOrderChatUnread: number;
}): void {
  const communityMessengerUnread = Math.max(0, Math.floor(input.communityMessengerUnread || 0));
  const tradeUnread = Math.max(0, Math.floor(input.tradeUnread || 0));
  const storeOrderChatUnread = Math.max(0, Math.floor(input.storeOrderChatUnread || 0));
  const current = getOwnerHubBadgeSnapshot();
  const philife = Math.max(0, current.philifeChatUnread || 0);
  applyOwnerHubBadgePayload(
    {
      ok: true,
      ...current,
      communityMessengerUnread,
      chatUnread: tradeUnread,
      storeOrderChatUnread,
      socialChatUnread: communityMessengerUnread + philife,
    },
    { kind: "optimistic" }
  );
}
