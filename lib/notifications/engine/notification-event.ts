/**
 * Phase 2 — NotificationEvent SSOT contract (CM direct / group).
 *
 * Engine emits these events only. Consumers are not wired in Phase 2.
 */

import type { NotificationDecision } from "@/lib/notifications/engine/notification-decision";

export type NotificationEventType =
  | "CHAT_MESSAGE_CREATED"
  | "CHAT_ROOM_READ"
  | "GROUP_MESSAGE_CREATED"
  | "GROUP_ROOM_READ";

export type CmNotificationRoomKind = "direct" | "group";

export type NotificationEventBase = {
  eventId: string;
  type: NotificationEventType;
  roomId: string;
  userId: string;
  createdAt: string;
  causation?: string;
  decision: NotificationDecision;
};

export type ChatMessageCreatedNotificationEvent = NotificationEventBase & {
  type: "CHAT_MESSAGE_CREATED";
  messageId: string;
  senderUserId: string;
  roomKind: "direct";
};

export type GroupMessageCreatedNotificationEvent = NotificationEventBase & {
  type: "GROUP_MESSAGE_CREATED";
  messageId: string;
  senderUserId: string;
  roomKind: "group";
};

export type ChatRoomReadNotificationEvent = NotificationEventBase & {
  type: "CHAT_ROOM_READ";
  lastReadMessageId?: string | null;
  roomKind: "direct";
};

export type GroupRoomReadNotificationEvent = NotificationEventBase & {
  type: "GROUP_ROOM_READ";
  lastReadMessageId?: string | null;
  roomKind: "group";
};

export type MessageCreatedNotificationEvent =
  | ChatMessageCreatedNotificationEvent
  | GroupMessageCreatedNotificationEvent;

export type RoomReadNotificationEvent = ChatRoomReadNotificationEvent | GroupRoomReadNotificationEvent;

export type NotificationEvent = MessageCreatedNotificationEvent | RoomReadNotificationEvent;

export function isMessageCreatedNotificationEvent(
  event: NotificationEvent
): event is MessageCreatedNotificationEvent {
  return event.type === "CHAT_MESSAGE_CREATED" || event.type === "GROUP_MESSAGE_CREATED";
}

export function isRoomReadNotificationEvent(event: NotificationEvent): event is RoomReadNotificationEvent {
  return event.type === "CHAT_ROOM_READ" || event.type === "GROUP_ROOM_READ";
}

export function notificationEventTypeForRoomKind(
  roomKind: CmNotificationRoomKind,
  phase: "message_created" | "room_read"
): NotificationEventType {
  if (phase === "message_created") {
    return roomKind === "group" ? "GROUP_MESSAGE_CREATED" : "CHAT_MESSAGE_CREATED";
  }
  return roomKind === "group" ? "GROUP_ROOM_READ" : "CHAT_ROOM_READ";
}
