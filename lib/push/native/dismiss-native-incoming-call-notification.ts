"use client";

import { requestCloseMessengerCallNotifications } from "@/lib/push/push-manager";
import { getNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

/** 브라우저 Notification·SW·Android/iOS 네이티브 수신 통화 알림 일괄 정리 */
export async function dismissAllIncomingCallNotifications(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  if (!sid) return;
  requestCloseMessengerCallNotifications(sid);
  const ref = await getNativeIncomingCallPlugin();
  const plugin = ref?.plugin;
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
