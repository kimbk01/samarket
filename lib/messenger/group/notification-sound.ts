/**
 * group Notification + Sound — Domain 재추론 입력 금지.
 */
import type { MessengerNotificationPort, MessengerSoundPort } from "@/lib/messenger/contracts/ports";
import { assertGroupOwnedRoom } from "@/lib/messenger/group/identity";
import { GROUP_DOMAIN, GROUP_NAME_PLACEHOLDER } from "@/lib/messenger/group/types";

export type GroupNotificationDisplayInput = Readonly<{
  chatDomain: string;
  domainIdentityKey: string;
  roomId: string;
  eventId: string;
  groupName: string | null | undefined;
  groupImageUrl: string | null | undefined;
  senderName: string | null | undefined;
  messagePreview: string | null | undefined;
  roomType?: string | null;
  directKey?: string | null;
  pathname?: string | null;
  titleForInference?: string | null;
  memberCountForInference?: number | null;
  notificationTypeFallback?: string | null;
}>;

export function resolveGroupNotificationDisplay(input: GroupNotificationDisplayInput): {
  domain: typeof GROUP_DOMAIN;
  groupName: string;
  avatarUrl: string | null;
  senderName: string | null;
  preview: string;
} {
  if (input.chatDomain !== GROUP_DOMAIN) {
    throw new Error(`dibay_group_notification_rejects:${input.chatDomain}`);
  }
  if (!input.eventId.trim()) throw new Error("dibay_group_notification_event_required");
  if (
    input.roomType != null ||
    input.directKey != null ||
    input.pathname != null ||
    input.titleForInference != null ||
    input.memberCountForInference != null ||
    input.notificationTypeFallback != null
  ) {
    throw new Error("dibay_group_notification_reinference_forbidden");
  }
  assertGroupOwnedRoom({
    roomId: input.roomId,
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return {
    domain: GROUP_DOMAIN,
    groupName: input.groupName?.trim() || GROUP_NAME_PLACEHOLDER,
    avatarUrl: input.groupImageUrl?.trim() || null,
    senderName: input.senderName?.trim() || null,
    preview: input.messagePreview?.trim() || "",
  };
}

/** Phase 9 — Sound SSOT */
export const GROUP_SOUND_EVENT_KEY = "messenger_group_message_received" as const;

export function resolveGroupSoundKey(): { domain: typeof GROUP_DOMAIN; eventKey: string } {
  return { domain: GROUP_DOMAIN, eventKey: GROUP_SOUND_EVENT_KEY };
}

export const groupNotificationPort: MessengerNotificationPort = {
  domain: GROUP_DOMAIN,
  requiresStoredChatDomain: true,
};

export const groupSoundPort: MessengerSoundPort = {
  domain: GROUP_DOMAIN,
  soundKeyContract: GROUP_SOUND_EVENT_KEY,
};
