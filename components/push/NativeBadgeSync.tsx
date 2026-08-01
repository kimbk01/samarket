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
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";

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

    const apply = (reason: string) => {
      const phase = getSessionPhase();
      const n = readAppIconTotal();
      // Delivery Trigger trace (Samsung lag) — do not change Formula/Projection.
      logBadgeFdProbe("NativeBadgeSync.apply", {
        reason,
        phase,
        surfaceAppIcon: n,
        prev_count: lastAppliedRef.current?.count ?? null,
      });
      console.log("[dibay-delivery-trace]", {
        step: "NativeBadgeSync.apply",
        reason,
        phase,
        surfaceAppIcon: n,
        prev: lastAppliedRef.current,
        t: Date.now(),
      });
      if (phase !== "authenticated") {
        const prev = lastAppliedRef.current;
        if (prev?.phase === phase && prev.count === 0) return;
        lastAppliedRef.current = { phase, count: 0 };
        void clearNativeBadgeCount();
        return;
      }
      const prev = lastAppliedRef.current;
      if (prev?.phase === "authenticated" && prev.count === n) {
        console.log("[dibay-delivery-trace]", {
          step: "NativeBadgeSync.skip_same",
          count: n,
          t: Date.now(),
        });
        return;
      }
      lastAppliedRef.current = { phase: "authenticated", count: n };
      console.log("[dibay-delivery-trace]", {
        step: "NativeBadgeSync→syncNativeBadgeCount",
        count: n,
        t: Date.now(),
      });
      void syncNativeBadgeCount(n);
      logNotifyBadge("native_set", { count: n, source: "app_icon_projection" });
    };

    apply("effect_mount_or_total");
    const onPageShow = (ev: PageTransitionEvent) => {
      console.log("[dibay-delivery-trace]", {
        step: "pageshow",
        persisted: Boolean(ev.persisted),
        surfaceAppIcon: readAppIconTotal(),
        phase: getSessionPhase(),
        t: Date.now(),
      });
    };
    window.addEventListener("pageshow", onPageShow);
    const unsubPhase = subscribeSessionPhase(() => apply("session_phase"));
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      unsubPhase();
    };
  }, [total]);

  return null;
}
