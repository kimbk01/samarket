"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  myBottomNavNotificationUnreadStore,
  myGeneralNotificationUnreadStore,
} from "@/lib/notifications/notification-unread-badge-store";

export type MyNotificationUnreadVariant = "default" | "bottom_nav";

/** 마이 알림 미읽음 개수 (로그인·테이블 없으면 null 또는 0). 전역 단일 폴링. */
export function useMyNotificationUnreadCount(opts?: { variant?: MyNotificationUnreadVariant }) {
  const variant = opts?.variant ?? "default";
  const store = useMemo(
    () => (variant === "bottom_nav" ? myBottomNavNotificationUnreadStore : myGeneralNotificationUnreadStore),
    [variant]
  );
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
