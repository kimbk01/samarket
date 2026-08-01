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
    } else {
      await Badge.set({ count: value });
    }

    const platform = Capacitor.getPlatform();
    // Delivery Adapter v1 — platform OS badge only (never Kernel).
    if (platform === "android" || platform === "ios") {
      try {
        await DibayAppIconDelivery.apply({ count: value });
      } catch (deliveryErr) {
        const message =
          deliveryErr instanceof Error ? deliveryErr.message : String(deliveryErr);
        console.warn(
          `[native-badge] ${platform}_delivery_apply_failed count=`,
          value,
          message
        );
      }
    }

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
