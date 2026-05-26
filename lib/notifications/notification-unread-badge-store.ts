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

/** Realtime UPDATE burst(읽음 일괄 등) — trailing 1회만 unread fetch */
const NOTIFICATION_EVENT_FETCH_COALESCE_MS = 1_200;

function createNotificationUnreadBadgeStore(fetchUrl: string) {
  let snap: number | null = null;
  const listeners = new Set<() => void>();

  const flightKey = `notif-unread:${fetchUrl}`;
  const MIN_FETCH_GAP_MS = 8_000;
  let subscriberCount = 0;
  /** Strict Mode 등으로 구독이 잠깐 0이 되었다가 바로 복구될 때 이중 초기 fetch·이벤트 해제 방지 */
  let pendingStopTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  /** Strict Mode remount 시 pendingStopTimer 취소만 되고 removeEventListener 가 실행되지 않아 리스너·interval 이 중복 쌓이는 것 방지 */
  let listenersArmed = false;
  let unauthorizedPaused = false;
  let lastFetchStartedAt = 0;

  const coalescedEventFetch = createTrailingCoalescedCallback(
    () => void doFetch(false),
    NOTIFICATION_EVENT_FETCH_COALESCE_MS
  );
  const onNotifUpdated = () => coalescedEventFetch.schedule();

  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      /** `force: true` 는 8s 갭을 무시해 visibility 복귀·깜빡임이 잦을 때 /notifications 왕복이 누적됨. 폴링(87)·이벤트(24)와 동일한 갭을 적용 */
      void doFetch(false);
      armPoll();
    } else {
      disarmPoll();
    }
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
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      armPoll();
    }
  }

  function disarmListeners() {
    if (!listenersArmed) return;
    listenersArmed = false;
    coalescedEventFetch.cancel();
    window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.removeEventListener("visibilitychange", onVisibility);
    disarmPoll();
  }

  function start() {
    if (pendingStopTimer != null) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }
    subscriberCount += 1;
    if (subscriberCount > 1) return;
    void doFetch(snap == null);
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
  };
}

/** 일반 인앱 알림(오너 전용 매장주문 제외) — 상단 종·마이 허더 등, 구매자 매장주문 포함 */
export const myGeneralNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1&exclude_chat_message=1"
);

/** 하단 네비 「내정보」탭 — 구매자 매장주문(배송 중 등) 알림 미읽음은 제외 */
export const myBottomNavNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1&exclude_buyer_store_commerce=1&exclude_chat_message=1"
);

/** 매장 사업자 전용 매장주문 인앱 알림 */
export const ownerCommerceNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&owner_store_commerce_unread_only=1"
);
