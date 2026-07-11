/**
 * Phase 3-1 — Persistence Consumer (notification_events + notification_targets only).
 * Does NOT dispatch push. Does NOT mutate participants / messages.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryForEventType } from "@/lib/notifications/core/notification-policy";
import type { CreateNotificationEventInput } from "@/lib/notifications/core/notification-event-schema";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { markRoomNotificationEventsRead } from "@/lib/notifications/core/notification-event-repository";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import {
  buildRecipientMessageNotificationDisplay,
  loadMessageNotificationDisplaySharedContext,
} from "@/lib/notifications/display/load-message-notification-display-context";
import type {
  CreateNotificationEventOperation,
  PersistenceOperation,
  PersistencePlan,
} from "@/lib/notifications/engine/persistence/persistence-operation";
import {
  bumpChatRoomTargetFromMessengerParticipant,
  clearChatRoomTargetFromMessengerRead,
} from "@/lib/notifications/notification-targets";

export type PersistenceConsumerMessageDisplayInput = {
  senderUserId: string;
  preview: string;
  directKey?: string | null;
};

async function executeCreateNotificationEvent(
  sb: SupabaseClient<any>,
  op: CreateNotificationEventOperation,
  displayInput?: PersistenceConsumerMessageDisplayInput
): Promise<void> {
  const userId = op.userId.trim();
  const roomId = op.roomId?.trim() ?? "";
  const messageId = op.messageId?.trim() ?? "";
  const eventType = String(op.eventType ?? "") as CreateNotificationEventInput["type"];
  const dedupeKey = op.dedupeKey?.trim() ?? "";
  if (!userId || !roomId || !messageId || !eventType || !dedupeKey) return;

  const category = categoryForEventType(eventType);
  const roomKind = (eventType === "group_message" ? "group" : "direct") as NotificationMessageRoomKind;

  let title = "";
  let body = "";
  let displayPayload: Record<string, unknown> = {};

  if (displayInput?.senderUserId) {
    const displayShared = await loadMessageNotificationDisplaySharedContext(sb, {
      roomId,
      messageId,
      senderUserId: displayInput.senderUserId.trim(),
      recipientUserIds: [userId],
      preview: displayInput.preview,
      roomKind,
      directKey: displayInput.directKey ?? null,
    });
    const display = await buildRecipientMessageNotificationDisplay(
      sb,
      {
        roomId,
        messageId,
        senderUserId: displayInput.senderUserId.trim(),
        recipientUserId: userId,
        preview: displayInput.preview,
        roomKind,
        directKey: displayInput.directKey ?? null,
      },
      displayShared
    );
    title = display.title;
    body = display.body;
    displayPayload = display as Record<string, unknown>;
  }

  await createNotificationEvent(sb, {
    userId,
    type: eventType,
    category,
    roomId,
    messageId,
    actorUserId: displayInput?.senderUserId?.trim() || null,
    title,
    body,
    displayPayload,
    dedupeKey,
    mutedSnapshot: op.mutedSnapshot === true,
    pushSuppressedReason: (op.pushSuppressedReason ?? null) as CreateNotificationEventInput["pushSuppressedReason"],
    soundSuppressedReason: (op.soundSuppressedReason ?? null) as CreateNotificationEventInput["soundSuppressedReason"],
    unread: op.unread !== false,
  });
}

async function executePersistenceOperation(
  sb: SupabaseClient<any>,
  op: PersistenceOperation,
  displayInput?: PersistenceConsumerMessageDisplayInput
): Promise<void> {
  switch (op.kind) {
    case "create_notification_event":
      await executeCreateNotificationEvent(sb, op, displayInput);
      return;
    case "bump_notification_target":
      if (!op.roomId?.trim()) return;
      await bumpChatRoomTargetFromMessengerParticipant(sb, {
        userId: op.userId.trim(),
        roomId: op.roomId.trim(),
        isOwnerOrderChat: false,
        storeId: null,
      });
      return;
    case "clear_notification_target":
      if (!op.roomId?.trim()) return;
      await clearChatRoomTargetFromMessengerRead(sb, {
        userId: op.userId.trim(),
        roomId: op.roomId.trim(),
        isOwnerOrderChat: false,
        storeId: null,
      });
      return;
    case "mark_room_notification_events_read":
      if (!op.roomId?.trim()) return;
      await markRoomNotificationEventsRead(sb, op.userId.trim(), op.roomId.trim());
      return;
    default:
      return;
  }
}

export async function executePersistencePlan(
  sb: SupabaseClient<any>,
  plan: PersistencePlan | null,
  displayInput?: PersistenceConsumerMessageDisplayInput
): Promise<void> {
  if (!plan?.operations.length) return;
  for (const op of plan.operations) {
    await executePersistenceOperation(sb, op, displayInput).catch(() => {
      /* persistence consumer fire-and-forget */
    });
  }
}
