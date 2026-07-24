"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

function clampBadgeCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(999, Math.floor(count)));
}

/**
 * App icon badge — absolute set of Domain appIconTotal (never Bell, never +1).
 * Android launcher support is OEM-dependent (ShortcutBadger); failures are logged,
 * not swallowed silently. Notification tray number still comes from FCM setNumber.
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
    // ShortcutBadger.isSupported is OEM-heuristic only. Still apply absolute count —
    // Xiaomi often reports unsupported while Samsung accepts; OS tray number from
    // FCM setNumber remains the notification-based App Icon path when launcher API fails.
    if (supported === false) {
      console.warn("[native-badge] launcher_badge_unsupported_try_set count=", value);
    }
    if (value <= 0) {
      await Badge.clear();
      return { attempted: true, supported, applied: true };
    }
    await Badge.set({ count: value });
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
