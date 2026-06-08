/**
 * 마이 알림 미읽음 배지 — URL별 전역 단일 폴링.
 * 동일 API를 쓰는 컴포넌트가 여러 개여도(예: BottomNav + 마이 탭 헤더) 요청·interval 은 한 세트.
 */
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import { getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { logNetworkLoopGuard, logNetworkLoopGuardBlocked } from "@/lib/dev/network-loop-guard";
import { logFetchTrace, logPollingTrace } from "@/lib/dibay/network-fetch-storm-trace";
import { createTrailingCoalescedCallback } from "@/lib/http/coalesce-trailing-callback";

import {
  resolveTier1BellUnreadFetchUrl,
  type Tier1BellBadgeSurface,
} from "@/lib/notifications/resolve-tier1-bell-surface";

/** Realtime UPDATE burst(읽음 일괄 등) — trailing 1회만 unread fetch */
const NOTIFICATION_EVENT_FETCH_COALESCE_MS = 1_200;
/** 성공 응답 재사용 — 동일 URL 중복 GET 방지 */
const NOTIFICATION_UNREAD_CLIENT_TTL_MS = 20_000;
/** visibility 복귀 burst — trailing 1회 */
const NOTIFICATION_VISIBILITY_FETCH_COALESCE_MS = 900;
/** cold boot — visibility/pageshow/KASAMA force refresh 겹침 억제 */
export const NOTIFICATION_BOOT_SUPPRESS_MS = 3_000;

function createNotificationUnreadBadgeStore(fetchUrl: string) {
  let snap: number | null = null;
  const listeners = new Set<() => void>();

  const flightKey = `notif-unread:${fetchUrl}`;
  const MIN_FETCH_GAP_MS = NOTIFICATION_UNREAD_CLIENT_TTL_MS;
  let lastFetchCompletedAt = 0;
  let lastFetchStartedAt = 0;
  let storeBootAt = 0;
  let bootInitialFetchScheduled = false;
  let subscriberCount = 0;
  /** Strict Mode 등으로 구독이 잠깐 0이 되었다가 바로 복구될 때 이중 초기 fetch·이벤트 해제 방지 */
  let pendingStopTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  /** Strict Mode remount 시 pendingStopTimer 취소만 되고 removeEventListener 가 실행되지 않아 리스너·interval 이 중복 쌓이는 것 방지 */
  let listenersArmed = false;
  let unauthorizedPaused = false;

  const coalescedEventFetch = createTrailingCoalescedCallback(
    () => void doFetch(false),
    NOTIFICATION_EVENT_FETCH_COALESCE_MS
  );
  const coalescedVisibilityFetch = createTrailingCoalescedCallback(
    () => {
      if (storeBootAt > 0 && Date.now() - storeBootAt < NOTIFICATION_BOOT_SUPPRESS_MS) return;
      void doFetch(false);
    },
    NOTIFICATION_VISIBILITY_FETCH_COALESCE_MS
  );
  const onNotifUpdated = () => coalescedEventFetch.schedule();

  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      coalescedVisibilityFetch.schedule();
      armPoll();
    } else {
      coalescedVisibilityFetch.cancel();
      disarmPoll();
    }
  };

  const onPageShow = (e: Event) => {
    const pe = e as PageTransitionEvent;
    if (!pe.persisted) return;
    coalescedVisibilityFetch.schedule();
  };

  function emit() {
    for (const l of listeners) l();
  }

  function setSnap(next: number | null) {
    if (snap === next) return;
    snap = next;
    emit();
  }

  function doFetch(force = false): Promise<void> {
    if (!force && unauthorizedPaused) {
      return Promise.resolve();
    }
    const now = Date.now();
    if (
      force &&
      storeBootAt > 0 &&
      now - storeBootAt < NOTIFICATION_BOOT_SUPPRESS_MS &&
      snap != null &&
      lastFetchCompletedAt > 0
    ) {
      logNetworkLoopGuardBlocked({
        endpoint: fetchUrl,
        caller: "notification-unread-badge-store",
        reason: "boot_force_suppressed",
        ttl_hit: true,
        interval_id: pollInterval,
      });
      return Promise.resolve();
    }
    if (
      !force &&
      snap != null &&
      lastFetchCompletedAt > 0 &&
      now - lastFetchCompletedAt < NOTIFICATION_UNREAD_CLIENT_TTL_MS
    ) {
      logNetworkLoopGuardBlocked({
        endpoint: fetchUrl,
        caller: "notification-unread-badge-store",
        reason: "client_response_ttl",
        ttl_hit: true,
        interval_id: pollInterval,
      });
      return Promise.resolve();
    }
    if (!force && now - lastFetchStartedAt < MIN_FETCH_GAP_MS) {
      logNetworkLoopGuardBlocked({
        endpoint: fetchUrl,
        caller: "notification-unread-badge-store",
        reason: "min_fetch_gap",
        ttl_hit: true,
        interval_id: pollInterval,
      });
      return Promise.resolve();
    }
    const inFlight = getSingleFlightPromise<void>(flightKey);
    if (inFlight) {
      logNetworkLoopGuardBlocked({
        endpoint: fetchUrl,
        caller: "notification-unread-badge-store",
        reason: "single_flight_join",
        dedupe_hit: true,
        interval_id: pollInterval,
      });
      return inFlight;
    }
    lastFetchStartedAt = now;
    return runSingleFlight(flightKey, async () => {
      logNetworkLoopGuard({
        endpoint: fetchUrl,
        caller: "notification-unread-badge-store",
        reason: force ? "fetch_force" : "fetch",
        dedupe_hit: false,
        interval_id: pollInterval,
      });
      logFetchTrace({
        api: fetchUrl,
        component: "notification-unread-badge-store",
        reason: force ? "fetch_force" : "fetch",
      });
      try {
        const res = await fetch(fetchUrl, { credentials: "include" });
        if (res.status === 401) {
          setSnap(null);
          unauthorizedPaused = true;
          disarmPoll();
          return;
        }
        unauthorizedPaused = false;
        if (
          subscriberCount > 0 &&
          (typeof document === "undefined" || document.visibilityState === "visible")
        ) {
          armPoll();
        }
        const j = await res.json();
        if (j?.ok) {
          setSnap(Math.max(0, Math.floor(Number(j.unread_count) || 0)));
        } else {
          setSnap(0);
        }
        lastFetchCompletedAt = Date.now();
      } catch {
        setSnap(null);
      }
    });
  }

  function armPoll() {
    if (isDevSafeMode()) return;
    if (pollInterval != null) return;
    if (unauthorizedPaused) return;
    const createdAt = Date.now();
    pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void doFetch();
    }, NOTIFICATION_SYNC_POLL_MS);
    logPollingTrace({
      api: fetchUrl,
      intervalMs: NOTIFICATION_SYNC_POLL_MS,
      createdAt,
      cleanup: false,
      caller: "notification-unread-badge-store",
    });
  }

  function disarmPoll() {
    if (pollInterval != null) {
      logPollingTrace({
        api: fetchUrl,
        intervalMs: NOTIFICATION_SYNC_POLL_MS,
        createdAt: Date.now(),
        cleanup: true,
        caller: "notification-unread-badge-store",
      });
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function armListeners() {
    if (listenersArmed) return;
    listenersArmed = true;
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      armPoll();
    }
  }

  function disarmListeners() {
    if (!listenersArmed) return;
    listenersArmed = false;
    coalescedEventFetch.cancel();
    coalescedVisibilityFetch.cancel();
    window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    disarmPoll();
  }

  function scheduleBootFetch(): void {
    if (bootInitialFetchScheduled) {
      if (snap == null) void doFetch(false);
      return;
    }
    bootInitialFetchScheduled = true;
    storeBootAt = Date.now();
    void doFetch(false);
  }

  function start() {
    if (pendingStopTimer != null) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }
    subscriberCount += 1;
    if (subscriberCount > 1) return;
    scheduleBootFetch();
    armListeners();
  }

  function stop() {
    subscriberCount -= 1;
    if (subscriberCount > 0) return;
    if (pendingStopTimer != null) clearTimeout(pendingStopTimer);
    pendingStopTimer = setTimeout(() => {
      pendingStopTimer = null;
      if (subscriberCount > 0) return;
      disarmListeners();
    }, 0);
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    start();
    return () => {
      listeners.delete(listener);
      stop();
    };
  }

  function reconcile(next: number) {
    setSnap(Math.max(0, Math.floor(Number(next) || 0)));
  }

  function refresh(force = false) {
    return doFetch(force);
  }

  return {
    subscribe,
    getSnapshot: () => snap,
    getServerSnapshot: () => null as number | null,
    reconcile,
    refresh,
    pauseAndClear() {
      setSnap(null);
      unauthorizedPaused = false;
      bootInitialFetchScheduled = false;
      storeBootAt = 0;
      lastFetchCompletedAt = 0;
      lastFetchStartedAt = 0;
      disarmListeners();
    },
  };
}

const surfaceBadgeStores = new Map<string, ReturnType<typeof createNotificationUnreadBadgeStore>>();

function surfaceStoreKey(surface: Tier1BellBadgeSurface, storeId?: string | null): string {
  const sid = storeId?.trim() || "";
  return `${surface}::${sid}`;
}

/** Tier1 종 surface별 unread store — URL 단일 비행·TTL 공유 */
export function getSurfaceNotificationUnreadStore(
  surface: Tier1BellBadgeSurface,
  storeId?: string | null
) {
  const key = surfaceStoreKey(surface, storeId);
  let store = surfaceBadgeStores.get(key);
  if (!store) {
    store = createNotificationUnreadBadgeStore(resolveTier1BellUnreadFetchUrl(surface, storeId));
    surfaceBadgeStores.set(key, store);
  }
  return store;
}

/** 일반 인앱 알림(오너 전용 매장주문 제외) — tier1_inbox_bell surface */
export const myGeneralNotificationUnreadStore = getSurfaceNotificationUnreadStore("tier1_inbox_bell");

/** 하단 네비 「내정보」탭 — 구매자 매장주문(배송 중 등) 알림 미읽음은 제외 */
export const myBottomNavNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1&exclude_buyer_store_commerce=1&exclude_chat_message=1"
);

/** 매장 사업자 전용 매장주문 인백스 — owner_commerce_inbox surface (storeId 없음 = 전체) */
export const ownerCommerceNotificationUnreadStore = getSurfaceNotificationUnreadStore(
  "owner_commerce_inbox"
);

/** Realtime INSERT 등 — 마운트된 surface store + 하단탭 legacy store 일괄 갱신 */
export function refreshAllSurfaceNotificationUnreadStores(force = false): void {
  if (typeof window === "undefined") return;
  void myBottomNavNotificationUnreadStore.refresh(force);
  for (const store of surfaceBadgeStores.values()) {
    void store.refresh(force);
  }
}

/** 로그아웃·계정 전환 — unread badge 폴링·캐시 초기화 */
export function pauseAndClearAllNotificationUnreadBadgeStores(): void {
  myBottomNavNotificationUnreadStore.pauseAndClear();
  for (const store of surfaceBadgeStores.values()) {
    store.pauseAndClear();
  }
}
