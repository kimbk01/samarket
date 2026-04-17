"use client";

import {
  useMessageNotificationBridge,
  type MessageNotificationBridgePlayback,
} from "@/lib/community-messenger/notifications/use-message-notification-bridge";

export function GlobalCommunityMessengerUnreadSound({
  enabled = true,
  playback = "full",
}: {
  enabled?: boolean;
  playback?: MessageNotificationBridgePlayback;
}) {
  useMessageNotificationBridge(enabled, playback);

  return null;
}
