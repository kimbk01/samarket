/**
 * general_direct Notification display + SoundPort 계약 (Phase 2).
 * Push pipeline 교체는 Phase 9. Domain 재추론 금지.
 */
import type { MessengerNotificationPort, MessengerSoundPort } from "@/lib/messenger/contracts/ports";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import { GENERAL_DIRECT_DOMAIN, GENERAL_DIRECT_PEER_PLACEHOLDER_NAME } from "@/lib/messenger/general-direct/types";

export type GeneralDirectNotificationDisplayInput = Readonly<{
  chatDomain: string;
  domainIdentityKey: string;
  roomId: string;
  eventId: string;
  senderDisplayName: string | null | undefined;
  senderAvatarUrl: string | null | undefined;
  messagePreview: string | null | undefined;
  /** 금지 — 사용 시 throw */
  roomType?: string | null;
  directKey?: string | null;
  pathname?: string | null;
}>;

export type GeneralDirectNotificationDisplay = Readonly<{
  domain: typeof GENERAL_DIRECT_DOMAIN;
  title: string;
  avatarUrl: string | null;
  preview: string;
}>;

export function resolveGeneralDirectNotificationDisplay(
  input: GeneralDirectNotificationDisplayInput
): GeneralDirectNotificationDisplay {
  if (input.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error(`dibay_general_direct_notification_rejects:${input.chatDomain}`);
  }
  if (!input.eventId.trim()) throw new Error("dibay_general_direct_notification_event_required");
  if (input.roomType != null || input.directKey != null || input.pathname != null) {
    throw new Error("dibay_general_direct_notification_reinference_forbidden");
  }
  assertGeneralDirectOwnedRoom({
    roomId: input.roomId,
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return {
    domain: GENERAL_DIRECT_DOMAIN,
    title: input.senderDisplayName?.trim() || GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
    avatarUrl: input.senderAvatarUrl?.trim() || null,
    preview: input.messagePreview?.trim() || "",
  };
}

/** Phase 9 — existing Sound SSOT event key (production pipeline 교체 없음) */
export const GENERAL_DIRECT_SOUND_EVENT_KEY = "messenger_direct_message_received" as const;

export function resolveGeneralDirectSoundKey(): { domain: typeof GENERAL_DIRECT_DOMAIN; eventKey: string } {
  return { domain: GENERAL_DIRECT_DOMAIN, eventKey: GENERAL_DIRECT_SOUND_EVENT_KEY };
}

export const generalDirectNotificationPort: MessengerNotificationPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  requiresStoredChatDomain: true,
};

export const generalDirectSoundPort: MessengerSoundPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  soundKeyContract: GENERAL_DIRECT_SOUND_EVENT_KEY,
};
