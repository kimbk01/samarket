"use client";

/**
 * On logout / terminal guest — clear OS delivered notification tray so previous-account
 * alerts already shown (esp. iOS APNs alert) do not remain tappable.
 */

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export async function clearAllDeliveredNotificationsForLogout(reason: string): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    if (typeof PushNotifications.removeAllDeliveredNotifications === "function") {
      await PushNotifications.removeAllDeliveredNotifications();
      console.info("[push] delivered_notifications_cleared_logout", { reason });
      return;
    }
    const delivered = await PushNotifications.getDeliveredNotifications();
    const list = delivered?.notifications ?? [];
    if (list.length === 0) return;
    await PushNotifications.removeDeliveredNotifications({ notifications: list });
    console.info("[push] delivered_notifications_cleared_logout", {
      reason,
      count: list.length,
      via: "removeDeliveredNotifications",
    });
  } catch (error) {
    console.warn("[push] delivered_notifications_clear_logout_failed", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
