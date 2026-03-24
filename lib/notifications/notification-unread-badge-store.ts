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
  let subscriberCount = 0;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  const onNotifUpdated = () => void doFetch();

  const onVisibility = () => {
    if (typeof document === "undefined") return;
    if (document.visibilityState === "visible") {
      void doFetch();
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

  function doFetch(): Promise<void> {
    return runSingleFlight(flightKey, async () => {
      try {
        const res = await fetch(fetchUrl, { credentials: "include" });
        if (res.status === 401) {
          setSnap(null);
          return;
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
    subscriberCount += 1;
    if (subscriberCount > 1) return;
    void doFetch();
    window.addEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      armPoll();
    }
  }

  function stop() {
    subscriberCount -= 1;
    if (subscriberCount > 0) return;
    window.removeEventListener(KASAMA_NOTIFICATIONS_UPDATED, onNotifUpdated);
    document.removeEventListener("visibilitychange", onVisibility);
    disarmPoll();
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

/** 일반 인앱 알림(매장 커머스 알림 제외) — 마이·하단 탭 배지 */
export const myGeneralNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&exclude_owner_store_commerce=1"
);

/** 매장 사업자 전용 매장주문 인앱 알림 */
export const ownerCommerceNotificationUnreadStore = createNotificationUnreadBadgeStore(
  "/api/me/notifications?unread_count_only=1&owner_store_commerce_unread_only=1"
);
