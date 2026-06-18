import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMessageDedupeKey,
  categoryForEventType,
  eventTypeForMessageRoomKind,
  resolveMessageEventTypeFromDirectKey,
} from "@/lib/notifications/core/notification-policy";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { logNotifyMessage } from "@/lib/notifications/core/notification-logs";
import { isNotificationBlockedForRecipient } from "@/lib/notifications/policy/notification-block-policy";
import { isRoomMutedForUser } from "@/lib/notifications/policy/notification-mute-policy";
import {
  loadRecipientPresenceSnapshot,
  resolvePresenceSuppressDecision,
} from "@/lib/notifications/policy/notification-presence-policy";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
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
};

function resolveEventType(input: NotifyMessagePipelineInput) {
  if (input.roomKind) return eventTypeForMessageRoomKind(input.roomKind);
  return resolveMessageEventTypeFromDirectKey(input.directKey);
}

async function buildTitleBody(
  sb: SupabaseClient<any>,
  recipientUserId: string,
  preview: string,
  input: NotifyMessagePipelineInput
): Promise<{ title: string; body: string }> {
  const language = await loadNotificationUserLanguage(sb, recipientUserId);
  const previewBody = preview.slice(0, 200);
  if (input.roomKind === "group") {
    return {
      title: notifySafeT(language, "notify_group_chat_message_title"),
      body: previewBody || notifySafeT(language, "notify_group_chat_new_message_preview"),
    };
  }
  const title = input.hasMention
    ? notifySafeT(language, "notify_chat_mention_title")
    : notifySafeT(language, "notify_chat_new_message_title");
  const body = previewBody || notifySafeT(language, "notify_chat_message_arrived_body");
  return { title, body };
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

  const eventType = resolveEventType(input);
  const category = categoryForEventType(eventType);
  const dedupeKey = buildMessageDedupeKey(roomId, messageId);

  logNotifyMessage("create_start", { roomId, messageId, recipientCount: recipients.length });

  for (const recipientUserId of recipients) {
    if (!recipientUserId || recipientUserId === senderUserId) continue;

    if (await isNotificationBlockedForRecipient(sb, recipientUserId, senderUserId)) {
      logNotifyMessage("blocked_suppressed", { roomId, recipientUserId, senderUserId });
      continue;
    }

    const muted = await isRoomMutedForUser(sb, recipientUserId, roomId);
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

    const { title, body } = await buildTitleBody(sb, recipientUserId, input.preview, input);

    const created = await createNotificationEvent(sb, {
      userId: recipientUserId,
      type: eventType,
      category,
      roomId,
      messageId,
      actorUserId: senderUserId,
      title,
      body,
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
