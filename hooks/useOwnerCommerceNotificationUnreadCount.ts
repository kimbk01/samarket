"use client";

import { useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import {
  cancelOwnerHubSecondaryFetchKey,
  OWNER_HUB_SECONDARY_AFTER_MS,
  scheduleOwnerHubSecondaryFetch,
} from "@/lib/business/owner-hub-secondary-fetch-queue";
import { ownerCommerceNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";

/** 매장 사업자 전용 매장주문 인앱 알림 미읽음. 전역 단일 폴링. */
export function useOwnerCommerceNotificationUnreadCount() {
  return useSyncExternalStore(
    ownerCommerceNotificationUnreadStore.subscribe,
    ownerCommerceNotificationUnreadStore.getSnapshot,
    ownerCommerceNotificationUnreadStore.getServerSnapshot
  );
}

/**
 * `/stores/owner` 허브 — 첫 페인트 후 idle 에만 구독(종 배지). `enabled=false` 면 0.
 */
/** `defer=true` — 허브 첫 페인트 이후 idle 까지 구독·fetch 미시작 */
export function useOwnerCommerceNotificationUnreadCountDeferred(defer: boolean) {
  const [armed, setArmed] = useState(!defer);
  const armGenRef = useRef(0);

  useEffect(() => {
    if (!defer) {
      setArmed(true);
      return;
    }
    if (armed) return;
    const gen = ++armGenRef.current;
    scheduleOwnerHubSecondaryFetch(
      async () => {
        if (gen !== armGenRef.current) return;
        setArmed(true);
      },
      { afterMs: OWNER_HUB_SECONDARY_AFTER_MS.notifications, key: "notifications" }
    );
    return () => {
      armGenRef.current += 1;
      cancelOwnerHubSecondaryFetchKey("notifications");
    };
  }, [defer, armed]);

  return useSyncExternalStore(
    armed ? ownerCommerceNotificationUnreadStore.subscribe : () => () => {},
    armed ? ownerCommerceNotificationUnreadStore.getSnapshot : () => 0,
    () => 0
  );
}
