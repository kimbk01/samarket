"use client";

import { useMessageNotificationBridge } from "@/lib/community-messenger/notifications/use-message-notification-bridge";

export function GlobalCommunityMessengerUnreadSound({ enabled = true }: { enabled?: boolean }) {
  useMessageNotificationBridge(enabled);

  return null;
}
