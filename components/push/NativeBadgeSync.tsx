"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  getDomainBadgeSurfaceSnapshot,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import { clearNativeBadgeCount, syncNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/**
 * Runtime App Icon authority = domain-badge-surface-store only.
 * DO NOT read Phase H App Icon contract mirror as a runtime/fallback source.
 * DO NOT mirror Header Bell total.
 * Same appIconTotal → skip duplicate Badge.set (Phase 3-1).
 */
function readAppIconTotal(): number {
  const surface = getDomainBadgeSurfaceSnapshot();
  return Math.max(0, Math.floor(Number(surface.appIconTotal) || 0));
}

export function NativeBadgeSync() {
  const total = useSyncExternalStore(
    subscribeDomainBadgeSurface,
    readAppIconTotal,
    () => 0
  );
  const lastAppliedRef = useRef<{ phase: string; count: number } | null>(null);

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;

    const apply = () => {
      const phase = getSessionPhase();
      if (phase !== "authenticated") {
        const prev = lastAppliedRef.current;
        if (prev?.phase === phase && prev.count === 0) return;
        lastAppliedRef.current = { phase, count: 0 };
        void clearNativeBadgeCount();
        return;
      }
      const n = readAppIconTotal();
      const prev = lastAppliedRef.current;
      if (prev?.phase === "authenticated" && prev.count === n) return;
      lastAppliedRef.current = { phase: "authenticated", count: n };
      void syncNativeBadgeCount(n);
      logNotifyBadge("native_set", { count: n, source: "app_icon_projection" });
    };

    apply();
    return subscribeSessionPhase(() => apply());
  }, [total]);

  return null;
}
