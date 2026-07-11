/**
 * Phase 3-1 — Engine persistence plan from NotificationEvent.
 */

import type { NotificationEvent } from "@/lib/notifications/engine/notification-event";
import {
  isMessageCreatedNotificationEvent,
  isRoomReadNotificationEvent,
} from "@/lib/notifications/engine/notification-event";
import {
  buildMessageDedupeKey,
} from "@/lib/notifications/core/notification-policy";
import type { NotificationEventType as DbNotificationEventType } from "@/lib/notifications/core/notification-event-types";
import {
  createPersistencePlan,
  type PersistenceOperation,
  type PersistencePlan,
} from "@/lib/notifications/engine/persistence/persistence-operation";
import type { LegacyRoomReadPersistenceScope } from "@/lib/notifications/engine/persistence/legacy-room-read-persistence-plan";

export type EnginePersistencePhase = "message_event" | "message_target" | "room_read";

function dbEventTypeForEngineEvent(event: NotificationEvent): DbNotificationEventType | null {
  if (event.type === "CHAT_MESSAGE_CREATED") return "chat_message";
  if (event.type === "GROUP_MESSAGE_CREATED") return "group_message";
  return null;
}

function resolvePushSuppressedReason(decision: NotificationEvent["decision"]): string | null {
  if (decision.suppressReasons.includes("same_room_foreground")) return "same_room_foreground";
  if (decision.suppressReasons.includes("room_muted")) return "muted_room";
  return null;
}

function hasAutoRead(decision: NotificationEvent["decision"]): boolean {
  return decision.suppressReasons.includes("auto_read_same_room");
}

export function buildEnginePersistencePlan(
  event: NotificationEvent,
  phase: EnginePersistencePhase,
  roomReadScope: LegacyRoomReadPersistenceScope = "mark_read_patch"
): PersistencePlan | null {
  if (phase === "message_event" && isMessageCreatedNotificationEvent(event)) {
    const eventType = dbEventTypeForEngineEvent(event);
    if (!eventType) return null;

    const roomId = event.roomId.trim();
    const messageId = event.messageId.trim();
    const userId = event.userId.trim();
    if (!roomId || !messageId || !userId) return null;

    const pushSuppressedReason = resolvePushSuppressedReason(event.decision);
    const soundSuppressedReason = pushSuppressedReason;
    const mutedSnapshot = event.decision.suppressReasons.includes("room_muted");

    const operations: PersistenceOperation[] = [
      {
        kind: "create_notification_event",
        userId,
        roomId,
        messageId,
        eventType,
        dedupeKey: buildMessageDedupeKey(roomId, messageId),
        unread: event.decision.showBottomBadge,
        mutedSnapshot,
        pushSuppressedReason,
        soundSuppressedReason,
      },
    ];

    if (hasAutoRead(event.decision)) {
      operations.push({
        kind: "mark_room_notification_events_read",
        userId,
        roomId,
      });
      operations.push({
        kind: "clear_notification_target",
        userId,
        roomId,
        targetType: "chat_room",
        targetId: roomId,
      });
    }

    return createPersistencePlan(operations);
  }

  if (phase === "message_target" && isMessageCreatedNotificationEvent(event)) {
    const roomId = event.roomId.trim();
    const userId = event.userId.trim();
    if (!roomId || !userId) return null;

    return createPersistencePlan([
      {
        kind: "bump_notification_target",
        userId,
        roomId,
        targetType: "chat_room",
        targetId: roomId,
        scope: "consumer",
      },
    ]);
  }

  if (phase === "room_read" && isRoomReadNotificationEvent(event)) {
    const roomId = event.roomId.trim();
    const userId = event.userId.trim();
    if (!roomId || !userId) return null;

    const operations: PersistenceOperation[] = [
      {
        kind: "clear_notification_target",
        userId,
        roomId,
        targetType: "chat_room",
        targetId: roomId,
      },
    ];

    if (roomReadScope === "mark_room_read_api") {
      operations.unshift({
        kind: "mark_room_notification_events_read",
        userId,
        roomId,
      });
    }

    return createPersistencePlan(operations);
  }

  return null;
}
