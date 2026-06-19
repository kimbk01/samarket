import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMentionDedupeKey,
  buildMessageDedupeKey,
  categoryForEventType,
  eventTypeForMessageRoomKind,
  resolveMessageEventTypeFromDirectKey,
} from "@/lib/notifications/core/notification-policy";
import { shouldNotifyMentionRecipient } from "@/lib/community-messenger/group/group-room-mention-policy";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import {
  buildRecipientMessageNotificationDisplay,
  loadMessageNotificationDisplaySharedContext,
} from "@/lib/notifications/display/load-message-notification-display-context";
import { isNotificationBlockedForRecipient } from "@/lib/notifications/policy/notification-block-policy";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";
import {
  loadRecipientPresenceSnapshot,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import { dispatchNotificationPushIfAllowed } from "@/lib/notifications/pipeline/notify-push-dispatcher";
import { markRoomRead } from "@/lib/notifications/pipeline/notify-read-service";

export type NotifyMessagePipelineInput = {
  roomId: string;
  messageId: string;
  senderUserId: string;
  preview: string;
  recipientUserIds: string[];
  roomKind?: NotificationMessageRoomKind;
  directKey?: string | null;
  hasMention?: boolean;
  mentionUserIds?: string[];
};

function resolveEventType(input: NotifyMessagePipelineInput) {
  if (input.roomKind) return eventTypeForMessageRoomKind(input.roomKind);
  return resolveMessageEventTypeFromDirectKey(input.directKey);
}

export async function notifyMessagePipeline(
  sb: SupabaseClient<any>,
  input: NotifyMessagePipelineInput
): Promise<void> {
  const roomId = input.roomId.trim();
  const messageId = input.messageId.trim();
  const senderUserId = input.senderUserId.trim();
  const recipients = input.recipientUserIds.map((id) => id.trim()).filter(Boolean);
  if (!roomId || !messageId || !senderUserId || !recipients.length) return;

  const baseEventType = resolveEventType(input);

  logNotifyMessage("create_start", { roomId, messageId, recipientCount: recipients.length });

  const displayShared = await loadMessageNotificationDisplaySharedContext(sb, {
    roomId,
    messageId,
    senderUserId,
    recipientUserIds: recipients,
    preview: input.preview,
    roomKind: input.roomKind,
    directKey: input.directKey,
  });

  for (const recipientUserId of recipients) {
    if (!recipientUserId || recipientUserId === senderUserId) continue;

    if (await isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId)) {
      logNotifyMessage("blocked_suppressed", { roomId, recipientUserId, senderUserId });
      continue;
    }

    const isMentioned = shouldNotifyMentionRecipient({
      mentionUserIds: input.mentionUserIds ?? [],
      recipientUserId,
      senderUserId,
    });
    const eventType = isMentioned ? ("mention_message" as const) : baseEventType;
    const category = categoryForEventType(eventType);
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

    if (muted) logNotifyMessage("muted_sound_suppressed", { roomId, recipientUserId });
    if (presenceDecision.reason === "same_room_foreground") {
      logNotifyMessage("suppressed_same_room", { roomId, recipientUserId });
    }

    const display = await buildRecipientMessageNotificationDisplay(
      sb,
      {
        roomId,
        messageId,
        senderUserId,
        recipientUserId,
        preview: input.preview,
        roomKind: input.roomKind,
        directKey: input.directKey,
      },
      displayShared
    );

    const created = await createNotificationEvent(sb, {
      userId: recipientUserId,
      type: eventType,
      category,
      roomId,
      messageId,
      actorUserId: senderUserId,
      title: display.title,
      body: display.body,
      displayPayload: display,
      dedupeKey,
      mutedSnapshot: muted,
      pushSuppressedReason,
      soundSuppressedReason,
      unread: !presenceDecision.suppressBadge,
    });

    if (!created.ok) {
      if (created.duplicate) continue;
      logNotifyMessage("create_done", { roomId, recipientUserId, error: created.error });
      continue;
    }

    logNotifyMessage("create_done", { roomId, recipientUserId, eventId: created.row.id });

    if (presenceDecision.autoRead) {
      await markRoomRead(sb, recipientUserId, roomId);
    } else {
      invalidateNotificationBadgeCache(recipientUserId);
    }

    await dispatchNotificationPushIfAllowed(sb, created.row);
  }
}
