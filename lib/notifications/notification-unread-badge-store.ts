/**
 * 마이 알림 미읽음 배지 — URL별 전역 단일 폴링.
 * 동일 API를 쓰는 컴포넌트가 여러 개여도(예: BottomNav + 마이 탭 헤더) 요청·interval 은 한 세트.
 */
import {
  KASAMA_NOTIFICATIONS_UPDATED,
  NOTIFICATION_SYNC_POLL_MS,
} from "@/lib/notifications/notification-events";
import { runSingleFlight } from "@/lib/http/run-single-flight";

function createNotificationUnreadBadgeStore(fetchUrl: string) {
  let snap: number | null = null;
  const listeners = new Set<() => void>();

  const flightKey = `notif-unread:${fetchUrl}`;
  const MIN_FETCH_GAP_MS = 8_000;
  let subscriberCount = 0;
  /** Strict Mode 등으로 구독이 잠깐 0이 되었다가 바로 복구될 때 이중 초기 fetch·이벤트 해제 방지 */
  let pendingStopTimer: ReturnType<typeof setTimeout> | null = null;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let unauthorizedPaused = false;
  let lastFetchStartedAt = 0;

  const onNotifUpdated = () => void doFetch(true);

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
      return Promise.resolve();
    }
    lastFetchStartedAt = now;
    return runSingleFlight(flightKey, async () => {
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
    if (pollInterval != null) return;
    if (unauthorizedPaused) return;
    pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void doFetch();
    }, NOTIFICATION_SYNC_POLL_MS);
  }

  function disarmPoll() {
    if (pollInterval != null) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function start() {
    if (pendingStopTimer != null) {
      clearTimeout(pendingStopTimer);
      pendingStopTimer = null;
    }
    subscriberCount += 1;
    if (subscriberCount > 1) return;
    void doFetch(snap == null);
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      armPoll();
    }
  }

  function stop() {
    subscriberCount -= 1;
    if (subscriberCount > 0) return;
    if (pendingStopTimer != null) clearTimeout(pendingStopTimer);
    pendingStopTimer = setTimeout(() => {
      pendingStopTimer = null;
      if (subscriberCount > 0) return;
      window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
      document.removeEventListener("visibilitychange", onVisibility);
      disarmPoll();
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

  return {
    subscribe,
    getSnapshot: () => snap,
    getServerSnapshot: () => null as number | null,
  };
}

/** 일반 인앱 알림(오너 전용 매장주문 제외) — 상단 종·마이 허더 등, 구매자 매장주문 포함 */
export const myGeneralNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1"
);

/** 하단 네비 「내정보」탭 — 구매자 매장주문(배송 중 등) 알림 미읽음은 제외 */
export const myBottomNavNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1&exclude_buyer_store_commerce=1"
);

/** 매장 사업자 전용 매장주문 인앱 알림 */
export const ownerCommerceNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&owner_store_commerce_unread_only=1"
);
