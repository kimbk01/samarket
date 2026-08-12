"use client";

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  getDomainBadgeSurfaceSnapshot,
  subscribeDomainBadgeSurface,
} from "@/lib/messenger/contracts/domain-badge-surface-store";
import {
  getProjectionAuthorityState,
  subscribeProjectionAuthorityState,
} from "@/lib/notifications/projection-authority";
import { clearNativeBadgeCount, syncNativeBadgeCount } from "@/lib/push/native/sync-native-badge-count";
import { resolveNativeBadgeSyncWrite } from "@/lib/push/native/native-badge-sync-policy";
import {
  hasPendingLogoutBadgeClearTransaction,
  recoverPendingLogoutBadgeClearTransaction,
} from "@/lib/push/native/logout-badge-clear-transaction";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";

/**
 * Slice 2-6 — Native echoes MemberAppIconTotal absolute (surface.appIconTotal).
 * Surface is fed by Web Authority (A_member + B_member). Native does not compute.
 * DO NOT read Phase H App Icon contract mirror as a runtime/fallback source.
 * DO NOT mirror Header Bell total / B_store / C_store.
 * Same total → skip duplicate Badge.set (Phase 3-1).
 *
 * Boot flicker contract:
 * - authenticated + Projection COMPLETE 전 → no Badge.clear / set(0)
 * - pending logout badge clear tx → recover before hold (ROOT FIX)
 * - terminal_guest only → defensive clear (not primary gate)
 * - Cap resume cache never final authority
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
  const projectionState = useSyncExternalStore(
    subscribeProjectionAuthorityState,
    getProjectionAuthorityState,
    () => "EMPTY" as const
  );
  const lastAppliedRef = useRef<{ phase: string; projection: string; count: number } | null>(
    null
  );
  const lastMemberIdRef = useRef<string>("");

  useEffect(() => {
    if (!isCapacitorNativePlatform()) {
      // Web: still drain pending as web_no_native if any survived (rare).
      if (hasPendingLogoutBadgeClearTransaction()) {
        void recoverPendingLogoutBadgeClearTransaction();
      }
      return;
    }

    const apply = (reason: string) => {
      const phase = getSessionPhase();
      const proj = getProjectionAuthorityState();
      const n = readAppIconTotal();
      const pendingLogoutClear = hasPendingLogoutBadgeClearTransaction();
      const memberId = getSyncViewerUserIdForClient()?.trim() ?? "";
      const prevMemberId = lastMemberIdRef.current;
      if (prevMemberId && memberId && prevMemberId !== memberId) {
        lastMemberIdRef.current = memberId;
        lastAppliedRef.current = null;
        void clearNativeBadgeCount({ reason: "account_switch" });
        logBadgeFdProbe("NativeBadgeSync.account_switch", {
          prevMemberId,
          memberId,
          surfaceAppIcon: n,
        });
      } else if (prevMemberId && !memberId) {
        lastMemberIdRef.current = "";
        lastAppliedRef.current = null;
        void clearNativeBadgeCount({ reason: "account_switch_detach" });
        return;
      } else if (memberId) {
        lastMemberIdRef.current = memberId;
      }
      const decision = resolveNativeBadgeSyncWrite({
        sessionPhase: phase,
        projectionState: proj,
        hasPendingLogoutBadgeClear: pendingLogoutClear,
      });
      logBadgeFdProbe("NativeBadgeSync.apply", {
        reason,
        phase,
        projectionState: proj,
        decision: decision.kind,
        decisionReason: decision.reason,
        surfaceAppIcon: n,
        pendingLogoutClear,
        prev_count: lastAppliedRef.current?.count ?? null,
      });
      console.log("[dibay-delivery-trace]", {
        step: "NativeBadgeSync.apply",
        reason,
        phase,
        projectionState: proj,
        decision: decision.kind,
        surfaceAppIcon: n,
        pendingLogoutClear,
        prev: lastAppliedRef.current,
        t: Date.now(),
      });

      if (decision.kind === "recover_logout_clear") {
        void recoverPendingLogoutBadgeClearTransaction().then((result) => {
          if (result?.outcome === "completed" || result?.outcome === "web_no_native_badge") {
            lastAppliedRef.current = { phase, projection: proj, count: 0 };
          }
        });
        return;
      }

      if (decision.kind === "hold") {
        console.log("[dibay-delivery-trace]", {
          step: "NativeBadgeSync.hold",
          holdReason: decision.reason,
          phase,
          projectionState: proj,
          surfaceAppIcon: n,
          t: Date.now(),
        });
        return;
      }

      if (decision.kind === "clear_logout") {
        // Defensive only — primary durable gate is logout transaction owner.
        if (hasPendingLogoutBadgeClearTransaction()) {
          void recoverPendingLogoutBadgeClearTransaction();
          return;
        }
        const prev = lastAppliedRef.current;
        if (prev?.phase === phase && prev.count === 0) return;
        lastAppliedRef.current = { phase, projection: proj, count: 0 };
        void clearNativeBadgeCount({ reason: "terminal_guest_defensive" });
        return;
      }

      // echo_authority — COMPLETE snapshot only (blocked while pending via syncNativeBadgeCount)
      if (hasPendingLogoutBadgeClearTransaction()) {
        void recoverPendingLogoutBadgeClearTransaction();
        return;
      }
      const prev = lastAppliedRef.current;
      if (
        prev?.phase === "authenticated" &&
        prev.projection === "COMPLETE" &&
        prev.count === n
      ) {
        console.log("[dibay-delivery-trace]", {
          step: "NativeBadgeSync.skip_same",
          count: n,
          t: Date.now(),
        });
        return;
      }
      lastAppliedRef.current = { phase: "authenticated", projection: "COMPLETE", count: n };
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
        projectionState: getProjectionAuthorityState(),
        pendingLogoutClear: hasPendingLogoutBadgeClearTransaction(),
        t: Date.now(),
      });
      if (hasPendingLogoutBadgeClearTransaction()) {
        apply("pageshow_pending_recover");
      }
    };
    window.addEventListener("pageshow", onPageShow);
    const unsubPhase = subscribeSessionPhase(() => apply("session_phase"));
    const unsubProj = subscribeProjectionAuthorityState(() => apply("projection_state"));
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      unsubPhase();
      unsubProj();
    };
  }, [total, projectionState]);

  return null;
}
