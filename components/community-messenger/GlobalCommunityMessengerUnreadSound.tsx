"use client";

import {
  useCmParticipantsHubSync,
  type MessageNotificationBridgePlayback,
} from "@/lib/community-messenger/notifications/use-cm-participants-hub-sync";

export function GlobalCommunityMessengerUnreadSound({
  enabled = true,
  playback = "full",
}: {
  enabled?: boolean;
  playback?: MessageNotificationBridgePlayback;
}) {
  useCmParticipantsHubSync(enabled, playback);

  return null;
}
