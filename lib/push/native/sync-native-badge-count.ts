"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

type DibayAppIconDeliveryPlugin = {
  apply: (options: { count: number }) => Promise<{ ok?: boolean; count?: number }>;
};

const DibayAppIconDelivery = registerPlugin<DibayAppIconDeliveryPlugin>("DibayAppIconDelivery");

function clampBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(999, Math.floor(count)));
}

/**
 * Delivery Adapter entry — absolute appIconTotal only (never Bell, never +1).
 * Cap Badge.set = cache echo.
 * Android Launcher = DibayAppIconDeliveryAdapter (S3) — LOCKED.
 * iOS SpringBoard = DibayAppIconDeliveryAdapter (APNS badge / setBadgeCount).
 */
export async function syncNativeBadgeCount(count: number): Promise<{
  attempted: boolean;
  supported: boolean | null;
  applied: boolean;
  error?: string;
}> {
  if (!isCapacitorNativePlatform()) {
    return { attempted: false, supported: null, applied: false };
  }
  const value = clampBadgeCount(count);
  const t0 = Date.now();
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
        console.log("[dibay-delivery-trace]", {
          step: "DibayAppIconDelivery.apply",
          count: value,
          platform,
          t: Date.now(),
        });
      } catch (deliveryErr) {
        const message =
          deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
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
    console.warn("[native-badge] set_failed count=", value, message);
    return { attempted: true, supported: null, applied: false, error: message };
  }
}

export async function clearNativeBadgeCount(): Promise<void> {
  await syncNativeBadgeCount(0);
}
