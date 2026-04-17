/**
 * 매장 오너 허브 배지 — 전역 단일 폴링·fetch.
 * (BottomNav + StoresHub 등) 여러 컴포넌트가 구독해도 GET /api/me/store-owner-hub-badge 는 한 갈래만 나감
 * (서버 28s 캐시). `/unreads`·`/store-attention` 세그먼트는 동일 집계 로직 분리용.
 */
import {
  OWNER_HUB_BADGE_EMPTY,
  parseOwnerHubBadgeJson,
  sameOwnerHubBadge,
  type OwnerHubBadgeBreakdown,
} from "@/lib/chats/owner-hub-badge-types";
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
import { samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";

const PATH_FETCH_PREFIXES = [
  "/chats",
  "/community-messenger",
  "/mypage/trade/chat",
  "/philife",
  "/orders",
  "/my/business/store-orders",
  "/my/business/store-order-chat",
  "/my/business/inquiries",
] as const;
/** `BottomNav`·`useOwnerHubBadgeBreakdown` 등 여러 곳에서 경로 변경 시 호출해도 한 번으로 합침 */
const HUB_PATH_REFRESH_DEBOUNCE_MS = 420;
let hubPathRefreshTimer: ReturnType<typeof setTimeout> | null = null;
/** 클라 최소 fetch 간격 — 서버 `HUB_BADGE_TTL_MS`(28s, owner-hub-badge-cache)·폴링과 함께 조정 */
const MIN_FETCH_GAP_MS = 22_000;
/** force=true 연타 시 inFlight 합류 — 거래 탭 배지·알림 즉시성과의 균형 */
const MIN_FORCE_FETCH_GAP_MS = 1_600;
const MIN_EVENT_REFRESH_GAP_MS = 5_000;
const EVENT_FORCE_REFRESH_DEBOUNCE_MS = 120;
/** 가시 탭 주기 폴링 — 포커스·이벤트 갱신과 별도 (`docs/messenger-realtime-policy.md`) */
const OWNER_HUB_BADGE_POLL_INTERVAL_MS = 180_000;
const MIN_VISIBILITY_FETCH_GAP_MS = 45_000;

let snapshot: OwnerHubBadgeBreakdown = OWNER_HUB_BADGE_EMPTY;
const listeners = new Set<() => void>();

let pollInterval: ReturnType<typeof setInterval> | null = null;
/** React Strict Mode: 리스너가 잠깐 비었다가 곧바로 다시 붙을 때 허브 중복 기동·해제 완화 */
let hubStopTimer: ReturnType<typeof setTimeout> | null = null;
let initialHydrateIdleId: number | null = null;
let hubStarted = false;
let globalEventsAttached = false;
let lastFetchStartedAt = 0;
let lastEventRefreshAt = 0;
let eventForceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
/** 메신저 `community_messenger_participants` unread — 5초 이벤트 갭·일반 허브 스케줄과 분리해 탭 배지 즉시성 */
let messengerHubBadgeCoalesceTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l();
}

function applyFromNetwork(data: unknown) {
  const next = parseOwnerHubBadgeJson(data);
  if (sameOwnerHubBadge(snapshot, next)) return;
  snapshot = next;
  emit();
}

export function applyCommunityMessengerUnreadOptimistic(unread: number): void {
  const nextUnread = Math.max(0, Math.floor(Number(unread) || 0));
  const next = {
    ...snapshot,
    communityMessengerUnread: nextUnread,
    total: Math.max(0, snapshot.socialChatUnread) + Math.max(0, snapshot.storesTabAttention) + nextUnread,
  };
  if (sameOwnerHubBadge(snapshot, next)) return;
  snapshot = next;
  emit();
  broadcastOwnerHubBadgeSnapshot({ ok: true, ...next });
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
      applyFromNetwork(d.data ?? null);
      return;
    }
    if (d.type === "request" && isLeaderOwnerHubBadgeRef.current) {
      const force = d.force === true;
      const now = Date.now();
      if (!force && now - lastEventRefreshAt < MIN_EVENT_REFRESH_GAP_MS) return;
      lastEventRefreshAt = now;
      void fetchOwnerHubBadgeNow(force);
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

export function fetchOwnerHubBadgeNow(force = false): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  ensureOwnerHubLeaderAndSync();

  if (!isLeaderOwnerHubBadgeRef.current) {
    postOwnerHubBadgeRefreshRequest(force);
    return Promise.resolve();
  }

  const now = Date.now();
  if (!force && now - lastFetchStartedAt < MIN_FETCH_GAP_MS) {
    const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);
    return inFlight ?? Promise.resolve();
  }
  if (force && now - lastFetchStartedAt < MIN_FORCE_FETCH_GAP_MS) {
    const inFlight = getSingleFlightPromise<void>(HUB_BADGE_FLIGHT_KEY);
    if (inFlight) return inFlight;
    /** 진행 중 비행이 없으면 이전 구현은 fetch 를 통째로 건너뛰어 메신저 연속 unread 시 탭 배지가 최대 1.6초 이상 밀릴 수 있음 */
  }

  lastFetchStartedAt = now;

  return runSingleFlight(HUB_BADGE_FLIGHT_KEY, async () => {
    try {
      /** `force` 시 `cmFresh=1` 로 서버 10s 짧은 캐시를 건너뛰어 메신저 Realtime·목록과 탭 배지가 엇갈리지 않게 한다. */
      const res = await fetch(force ? "/api/me/store-owner-hub-badge?cmFresh=1" : "/api/me/store-owner-hub-badge", {
        credentials: "include",
        cache: "no-store",
      });
      const data = res.ok ? await res.json() : null;
      samarketRuntimeDebugLog("owner-hub-badge", "leader HTTP fetch completed", { ok: res.ok });
      applyFromNetwork(data);
      broadcastOwnerHubBadgeSnapshot(data);
    } catch {
      applyFromNetwork(null);
      broadcastOwnerHubBadgeSnapshot(null);
    }
  });
}

function onTradeUnreadUpdated() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  scheduleEventDrivenOwnerHubRefresh();
}

type OwnerHubBadgeRefreshDetail = { source?: string; key?: string; at?: number };

function scheduleMessengerParticipantHubBadgeRefresh() {
  if (eventForceRefreshTimer != null) {
    clearTimeout(eventForceRefreshTimer);
    eventForceRefreshTimer = null;
  }
  if (messengerHubBadgeCoalesceTimer != null) {
    clearTimeout(messengerHubBadgeCoalesceTimer);
    messengerHubBadgeCoalesceTimer = null;
  }
  messengerHubBadgeCoalesceTimer = setTimeout(() => {
    messengerHubBadgeCoalesceTimer = null;
    void fetchOwnerHubBadgeNow(true);
  }, 80);
}

function onOwnerHubRefresh(ev?: Event) {
  const detail = (ev as CustomEvent<OwnerHubBadgeRefreshDetail> | undefined)?.detail;
  if (detail?.source === "community_messenger") {
    scheduleMessengerParticipantHubBadgeRefresh();
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
    void fetchOwnerHubBadgeNow(true);
  }, EVENT_FORCE_REFRESH_DEBOUNCE_MS);
}

function onVisibility() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "visible") {
    if (Date.now() - lastFetchStartedAt >= MIN_VISIBILITY_FETCH_GAP_MS) {
      void fetchOwnerHubBadgeNow();
    }
    if (hubStarted && pollInterval == null) {
      pollInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void fetchOwnerHubBadgeNow();
        }
      }, OWNER_HUB_BADGE_POLL_INTERVAL_MS);
    }
  } else if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function attachGlobalEventsOnce() {
  if (globalEventsAttached) return;
  globalEventsAttached = true;
  ensureOwnerHubLeaderAndSync();
  window.addEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onTradeUnreadUpdated);
  window.addEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onOwnerHubRefresh);
  document.addEventListener("visibilitychange", onVisibility);
}

function detachGlobalEvents() {
  if (!globalEventsAttached) return;
  globalEventsAttached = false;
  window.removeEventListener(KASAMA_TRADE_CHAT_UNREAD_UPDATED, onTradeUnreadUpdated);
  window.removeEventListener(KASAMA_OWNER_HUB_BADGE_REFRESH, onOwnerHubRefresh);
  document.removeEventListener("visibilitychange", onVisibility);
}

function stopHub() {
  hubStarted = false;
  if (initialHydrateIdleId != null) {
    cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
    initialHydrateIdleId = null;
  }
  if (pollInterval != null) {
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

function startHub() {
  if (hubStarted) return;
  hubStarted = true;
  attachGlobalEventsOnce();
  if (initialHydrateIdleId != null) {
    cancelScheduledWhenBrowserIdle(initialHydrateIdleId);
    initialHydrateIdleId = null;
  }
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    const initialDelay = isConstrainedNetwork() ? 2600 : 1200;
    initialHydrateIdleId = scheduleWhenBrowserIdle(() => {
      initialHydrateIdleId = null;
      void fetchOwnerHubBadgeNow(true);
    }, initialDelay);
  }
  if (typeof document === "undefined" || document.visibilityState === "visible") {
    pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void fetchOwnerHubBadgeNow();
      }
    }, OWNER_HUB_BADGE_POLL_INTERVAL_MS);
  }
}

export function subscribeOwnerHubBadge(listener: () => void) {
  if (hubStopTimer != null) {
    clearTimeout(hubStopTimer);
    hubStopTimer = null;
  }
  listeners.add(listener);
  startHub();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (hubStopTimer != null) clearTimeout(hubStopTimer);
    hubStopTimer = setTimeout(() => {
      hubStopTimer = null;
      if (listeners.size > 0) return;
      stopHub();
    }, 0);
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
    void fetchOwnerHubBadgeNow();
  }, HUB_PATH_REFRESH_DEBOUNCE_MS);
}
