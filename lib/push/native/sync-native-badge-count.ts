"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { logBadgeFdProbe } from "@/lib/notifications/badge-fd-probe-log";

type DibayAppIconDeliveryPlugin = {
  apply: (options: { count: number }) => Promise<{ ok?: boolean; count?: number }>;
};

const DibayAppIconDelivery = registerPlugin<DibayAppIconDeliveryPlugin>("DibayAppIconDelivery");

function clampBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(999, Math.floor(count)));
}

/**
 * Slice 2-6 — Delivery Adapter: absolute MemberAppIconTotal only.
 * Never Bell invent, never +1/-1, never B_store/C_store compute.
 * Cap Badge.set = cache echo.
 * Android Launcher = DibayAppIconDeliveryAdapter — LOCKED absolute setNumber.
 * iOS SpringBoard = setBadgeCount / applicationIconBadgeNumber — absolute.
 */
export async function syncNativeBadgeCount(count: number): Promise<{
  attempted: boolean;
  supported: boolean | null;
  applied: boolean;
  error?: string;
}> {
  if (!isCapacitorNativePlatform()) {
    logBadgeFdProbe("NativeBadgeSync.input", {
      count: clampBadgeCount(count),
      attempted: false,
      reason: "not_native_platform",
    });
    return { attempted: false, supported: null, applied: false };
  }
  const value = clampBadgeCount(count);
  if (value > 0) {
    const { hasPendingLogoutBadgeClearTransaction } = await import(
      "@/lib/push/native/logout-badge-clear-transaction"
    );
    if (hasPendingLogoutBadgeClearTransaction()) {
      logBadgeFdProbe("NativeBadgeSync.blocked_pending_logout_clear", {
        count: value,
        attempted: false,
      });
      console.log("[dibay-delivery-trace]", {
        step: "syncNativeBadgeCount.blocked_pending_logout_clear",
        count: value,
        t: Date.now(),
      });
      return {
        attempted: false,
        supported: null,
        applied: false,
        error: "blocked_pending_logout_clear",
      };
    }
  }
  const t0 = Date.now();
  logBadgeFdProbe("NativeBadgeSync.input", { count: value, attempted: true });
  console.log("[dibay-delivery-trace]", {
    step: "syncNativeBadgeCount.enter",
    count: value,
    t: t0,
  });
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    let supported: boolean | null = null;
    try {
      const result = await Badge.isSupported();
      supported = Boolean(result?.isSupported);
    } catch {
      supported = null;
    }
    if (supported === false) {
      console.warn("[native-badge] launcher_badge_unsupported_try_set count=", value);
    }
    if (value <= 0) {
      await Badge.clear();
      console.log("[dibay-delivery-trace]", {
        step: "Badge.clear",
        count: 0,
        t: Date.now(),
      });
    } else {
      await Badge.set({ count: value });
      console.log("[dibay-delivery-trace]", {
        step: "Badge.set",
        count: value,
        t: Date.now(),
      });
    }

    const platform = Capacitor.getPlatform();
    // Delivery Adapter v1 — platform OS badge only (never Kernel).
    if (platform === "android" || platform === "ios") {
      try {
        await DibayAppIconDelivery.apply({ count: value });
        logBadgeFdProbe("DeliveryAdapter.apply", { count: value, platform, ok: true });
        console.log("[dibay-delivery-trace]", {
          step: "DibayAppIconDelivery.apply",
          count: value,
          platform,
          t: Date.now(),
        });
      } catch (deliveryErr) {
        const message =
          deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
        logBadgeFdProbe("DeliveryAdapter.apply", {
          count: value,
          platform,
          ok: false,
          error: message,
        });
        console.warn(
          `[native-badge] ${platform}_delivery_apply_failed count=`,
          value,
          message
        );
        console.log("[dibay-delivery-trace]", {
          step: "DibayAppIconDelivery.apply_failed",
          count: value,
          message,
          t: Date.now(),
        });
      }
    }

    logBadgeFdProbe("native_badge_set.result", {
      count: value,
      supported,
      applied: true,
      elapsedMs: Date.now() - t0,
    });
    console.log("[dibay-delivery-trace]", {
      step: "syncNativeBadgeCount.return",
      count: value,
      supported,
      elapsedMs: Date.now() - t0,
      t: Date.now(),
    });
    return { attempted: true, supported, applied: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logBadgeFdProbe("native_badge_set.result", {
      count: value,
      applied: false,
      error: message,
    });
    console.warn("[native-badge] set_failed count=", value, message);
    return { attempted: true, supported: null, applied: false, error: message };
  }
}

export type ClearNativeBadgeOptions = {
  /** Audit / probe reason — logout durable clear uses explicit_logout / corrupt_session_clear. */
  reason?: string;
};

export type ClearNativeBadgeResult = {
  attempted: boolean;
  supported: boolean | null;
  applied: boolean;
  error?: string;
  reason: string;
  startedAt: number;
  completedAt: number;
};

/**
 * Absolute App Icon clear (0). Logout durable gate awaits this before navigate.
 * Web / non-native: attempted=false (valid fallback — nothing to clear).
 */
export async function clearNativeBadgeCount(
  options?: ClearNativeBadgeOptions
): Promise<ClearNativeBadgeResult> {
  const reason = String(options?.reason ?? "unspecified").trim() || "unspecified";
  const startedAt = Date.now();
  logBadgeFdProbe("clearNativeBadgeCount.start", { reason, t: startedAt });
  console.log("[dibay-delivery-trace]", {
    step: "clearNativeBadgeCount.start",
    reason,
    t: startedAt,
  });
  try {
    const result = await syncNativeBadgeCount(0);
    const completedAt = Date.now();
    if (result.attempted && !result.applied) {
      console.warn("[native-badge] clear_not_applied", {
        reason,
        error: result.error ?? null,
      });
    }
    logBadgeFdProbe("clearNativeBadgeCount.done", {
      reason,
      attempted: result.attempted,
      applied: result.applied,
      error: result.error ?? null,
      elapsedMs: completedAt - startedAt,
    });
    console.log("[dibay-delivery-trace]", {
      step: "clearNativeBadgeCount.done",
      reason,
      attempted: result.attempted,
      applied: result.applied,
      error: result.error ?? null,
      native_clear_completed_at: completedAt,
      t: completedAt,
    });
    return {
      attempted: result.attempted,
      supported: result.supported,
      applied: result.applied,
      error: result.error,
      reason,
      startedAt,
      completedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const completedAt = Date.now();
    logBadgeFdProbe("clearNativeBadgeCount.failed", {
      reason,
      error: message,
      elapsedMs: completedAt - startedAt,
    });
    console.warn("[native-badge] clear_threw", { reason, error: message });
    console.log("[dibay-delivery-trace]", {
      step: "clearNativeBadgeCount.failed",
      reason,
      error: message,
      native_clear_completed_at: completedAt,
      t: completedAt,
    });
    return {
      attempted: true,
      supported: null,
      applied: false,
      error: message,
      reason,
      startedAt,
      completedAt,
    };
  }
}
