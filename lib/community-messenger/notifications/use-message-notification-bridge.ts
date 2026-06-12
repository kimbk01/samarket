"use client";

/**
 * @deprecated import `useCmParticipantsHubSync` — BN12-A static/dynamic split.
 * Re-export for policy types and any legacy import paths.
 */
export {
  useCmParticipantsHubSync as useMessageNotificationBridge,
  type MessageNotificationBridgePlayback,
} from "@/lib/community-messenger/notifications/use-cm-participants-hub-sync";
