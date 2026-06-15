"use client";

import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";

type NativeIncomingCallPlugin = {
  dismissNotification(options: { sessionId: string }): Promise<void>;
};

let pluginPromise: Promise<NativeIncomingCallPlugin | null> | null = null;

async function getNativeIncomingCallPlugin(): Promise<NativeIncomingCallPlugin | null> {
  if (!isCapacitorNativePlatform()) return null;
  if (!pluginPromise) {
    pluginPromise = (async () => {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        return registerPlugin<NativeIncomingCallPlugin>("NativeIncomingCall");
      } catch {
        return null;
      }
    })();
  }
  return pluginPromise;
}

/** 브라우저 Notification·SW·Android/iOS 네이티브 수신 통화 알림 일괄 정리 */
export async function dismissAllIncomingCallNotifications(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  if (!sid) return;
  requestCloseMessengerCallNotifications(sid);
  const plugin = await getNativeIncomingCallPlugin();
  if (!plugin) return;
  try {
    await plugin.dismissNotification({ sessionId: sid });
  } catch {
    /* best-effort */
  }
}

export function dismissAllIncomingCallNotificationsFireAndForget(sessionId: string): void {
  void dismissAllIncomingCallNotifications(sessionId);
}
