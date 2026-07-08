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
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
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

type StoreOrderReceiverRole = "owner" | "user";

function resolveEventType(input: NotifyMessagePipelineInput) {
  if (input.roomKind) return eventTypeForMessageRoomKind(input.roomKind);
  return resolveMessageEventTypeFromDirectKey(input.directKey);
}

async function loadStoreOrderReceiverRoleByUserId(
  sb: SupabaseClient<any>,
  roomId: string,
  recipientUserIds: string[]
): Promise<Map<string, StoreOrderReceiverRole>> {
  const recipients = [...new Set(recipientUserIds.map((id) => id.trim()).filter(Boolean))];
  if (!roomId || recipients.length === 0) return new Map();

  const { data, error } = await sb
    .from("community_messenger_participants")
    .select("user_id, role")
    .eq("room_id", roomId)
    .in("user_id", recipients);
  if (error || !data) return new Map();

  const out = new Map<string, StoreOrderReceiverRole>();
  for (const row of data as Array<{ user_id?: unknown; role?: unknown }>) {
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const role = typeof row.role === "string" ? row.role.trim() : "";
    if (!userId) continue;
    if (role === "owner") out.set(userId, "owner");
    else if (role === "member") out.set(userId, "user");
  }
  return out;
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

  const receiverRoleByUserId =
    baseEventType === "store_order_message" || input.roomKind === "store_order"
      ? await loadStoreOrderReceiverRoleByUserId(sb, roomId, recipients)
      : new Map<string, StoreOrderReceiverRole>();

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
    const receiverRole = receiverRoleByUserId.get(recipientUserId);
    const displayPayload =
      receiverRole && eventType === "store_order_message"
        ? {
            ...display,
            receiverRole,
            legacyMeta: {
              kind: "store_order_message",
              receiverRole,
            },
          }
        : display;

    const created = await createAndDispatchNotificationEvent(sb, {
      userId: recipientUserId,
      type: eventType,
      category,
      roomId,
      messageId,
      actorUserId: senderUserId,
      title: display.title,
      body: display.body,
      displayPayload,
      dedupeKey,
      mutedSnapshot: muted,
      pushSuppressedReason,
      soundSuppressedReason,
      unread: !presenceDecision.suppressBadge,
      appState: String(presence.appVisibility ?? "").toLowerCase() === "foreground" ? "foreground" : "background",
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

  }
}
