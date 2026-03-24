"use client";

import { useSyncExternalStore } from "react";
import { ownerCommerceNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";

/** 매장 사업자 전용 매장주문 인앱 알림 미읽음. 전역 단일 폴링. */
export function useOwnerCommerceNotificationUnreadCount() {
  return useSyncExternalStore(
    ownerCommerceNotificationUnreadStore.subscribe,
    ownerCommerceNotificationUnreadStore.getSnapshot,
    ownerCommerceNotificationUnreadStore.getServerSnapshot
  );
}
