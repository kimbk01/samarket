"use client";

import { useEffect } from "react";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { useNotificationBadgeTotal } from "@/hooks/useNotificationBadgeCount";
import { clearNativeBadgeCount, syncNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/**
 * notification_events badge-count API → 앱 아이콘 badge (native only).
 */
export function NativeBadgeSync() {
  const total = useNotificationBadgeTotal();

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const apply = () => {
      const phase = getSessionPhase();
      if (phase !== "authenticated") {
        void clearNativeBadgeCount();
        return;
      }
      void syncNativeBadgeCount(total);
      logNotifyBadge("native_set", { count: total });
    };

    apply();
    return subscribeSessionPhase(() => apply());
  }, [total]);

  return null;
}
