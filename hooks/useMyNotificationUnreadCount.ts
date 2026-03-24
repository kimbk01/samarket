"use client";

import { useSyncExternalStore } from "react";
import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";

/** 마이 알림 미읽음 개수 (로그인·테이블 없으면 null 또는 0). 전역 단일 폴링. */
export function useMyNotificationUnreadCount() {
  return useSyncExternalStore(
    myGeneralNotificationUnreadStore.subscribe,
    myGeneralNotificationUnreadStore.getSnapshot,
    myGeneralNotificationUnreadStore.getServerSnapshot
  );
}
