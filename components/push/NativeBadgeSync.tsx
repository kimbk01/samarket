"use client";

import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  getDomainBadgeSurfaceSnapshot,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import { getAppIconBadgeProjection } from "@/lib/chat-domain/projections/app-icon-badge-projection";
import { clearNativeBadgeCount, syncNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/**
 * Domain App Icon projection → native app icon badge.
 * DO NOT mirror Header Bell total.
 */
function readAppIconTotal(): number {
  const surface = getDomainBadgeSurfaceSnapshot();
  if (surface.authority === "domain_badge" && surface.generation > 0) {
    return Math.max(0, surface.appIconTotal);
  }
  const proj = getAppIconBadgeProjection();
  return Math.max(0, Math.floor(Number(proj?.totalUnread) || 0));
}

export function NativeBadgeSync() {
  const total = useSyncExternalStore(
    subscribeDomainBadgeSurface,
    readAppIconTotal,
    () => 0
  );

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const apply = () => {
      const phase = getSessionPhase();
      if (phase !== "authenticated") {
        void clearNativeBadgeCount();
        return;
      }
      const n = readAppIconTotal();
      void syncNativeBadgeCount(n);
      logNotifyBadge("native_set", { count: n, source: "app_icon_projection" });
    };

    apply();
    return subscribeSessionPhase(() => apply());
  }, [total]);

  return null;
}
