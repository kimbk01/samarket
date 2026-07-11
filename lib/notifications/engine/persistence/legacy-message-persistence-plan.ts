/**
 * Phase 3-1 — Legacy persistence plan (read-only mirror of notify-message-pipeline).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldNotifyMentionRecipient } from "@/lib/community-messenger/group/group-room-mention-policy";
import {
  buildMentionDedupeKey,
  buildMessageDedupeKey,
  eventTypeForMessageRoomKind,
} from "@/lib/notifications/core/notification-policy";
import type { CmNotificationRoomKind } from "@/lib/notifications/engine/notification-event";
import {
  createPersistencePlan,
  type PersistenceOperation,
  type PersistencePlan,
} from "@/lib/notifications/engine/persistence/persistence-operation";
import { isNotificationBlockedForRecipient } from "@/lib/notifications/policy/notification-block-policy";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";
import {
  loadRecipientPresenceSnapshot,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";

export type LegacyMessagePersistencePlanInput = {
  roomId: string;
  messageId: string;
  senderUserId: string;
  recipientUserId: string;
  roomKind: CmNotificationRoomKind;
  mentionUserIds?: string[];
};

export async function buildLegacyMessageCreatedEventPersistencePlan(
  sb: SupabaseClient<any>,
  input: LegacyMessagePersistencePlanInput
): Promise<PersistencePlan | null> {
  const roomId = input.roomId.trim();
  const messageId = input.messageId.trim();
  const senderUserId = input.senderUserId.trim();
  const recipientUserId = input.recipientUserId.trim();
  if (!roomId || !messageId || !senderUserId || !recipientUserId || recipientUserId === senderUserId) {
    return null;
  }

  if (await isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId)) {
    return createPersistencePlan([]);
  }

  const baseEventType = eventTypeForMessageRoomKind(input.roomKind);
  const isMentioned = shouldNotifyMentionRecipient({
    mentionUserIds: input.mentionUserIds ?? [],
    recipientUserId,
    senderUserId,
  });
  const eventType = isMentioned ? "mention_message" : baseEventType;
  const dedupeKey = isMentioned
    ? buildMentionDedupeKey(roomId, messageId, recipientUserId)
    : buildMessageDedupeKey(roomId, messageId);

  const muted = isMentioned ? false : await isRoomMutedForUser(sb, recipientUserId, roomId);
  const presence = await loadRecipientPresenceSnapshot(sb, recipientUserId);
  const presenceDecision = resolvePresenceSuppressDecision(presence, roomId);

  const pushSuppressedReason = presenceDecision.suppressPush
    ? ("same_room_foreground" as const)
    : muted
      ? ("muted_room" as const)
      : null;
  const soundSuppressedReason = presenceDecision.suppressSound
    ? ("same_room_foreground" as const)
    : muted
      ? ("muted_room" as const)
      : null;

  const operations: PersistenceOperation[] = [
    {
      kind: "create_notification_event",
      userId: recipientUserId,
      roomId,
      messageId,
      eventType,
      dedupeKey,
      unread: !presenceDecision.suppressBadge,
      mutedSnapshot: muted,
      pushSuppressedReason,
      soundSuppressedReason,
    },
  ];

  if (presenceDecision.autoRead) {
    operations.push({
      kind: "mark_room_notification_events_read",
      userId: recipientUserId,
      roomId,
    });
    operations.push({
      kind: "clear_notification_target",
      userId: recipientUserId,
      roomId,
      targetType: "chat_room",
      targetId: roomId,
    });
  }

  return createPersistencePlan(operations);
}

export function buildLegacyMessageTargetBumpPersistencePlan(input: {
  roomId: string;
  recipientUserId: string;
}): PersistencePlan {
  const roomId = input.roomId.trim();
  const recipientUserId = input.recipientUserId.trim();
  if (!roomId || !recipientUserId) return createPersistencePlan([]);

  return createPersistencePlan([
    {
      kind: "bump_notification_target",
      userId: recipientUserId,
      roomId,
      targetType: "chat_room",
      targetId: roomId,
      scope: "consumer",
    },
  ]);
}
