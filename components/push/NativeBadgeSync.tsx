"use client";

import { useEffect } from "react";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";
import { clearNativeBadgeCount, syncNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";

/**
 * 서버 unread count → 앱 아이콘 badge 동기화 (native only).
 */
export function NativeBadgeSync() {
  const unread = useMyNotificationUnreadCount();

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const apply = () => {
      const phase = getSessionPhase();
      if (phase !== "authenticated") {
        void clearNativeBadgeCount();
        return;
      }
      const count = typeof unread === "number" ? unread : 0;
      void syncNativeBadgeCount(count);
    };

    apply();
    return subscribeSessionPhase(() => apply());
  }, [unread]);

  return null;
}
