import type {
  NotificationEventCategory,
  NotificationEventType,
  NotificationMessageRoomKind,
} from "@/lib/notifications/core/notification-event-types";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";

export function categoryForEventType(type: NotificationEventType): NotificationEventCategory {
  return getNotificationEventDefinition(type).eventCategory;
}

export function eventTypeForMessageRoomKind(kind: NotificationMessageRoomKind): NotificationEventType {
  switch (kind) {
    case "group":
      return "group_message";
    case "trade":
    case "trade_legacy":
      return "trade_message";
    case "store_order":
      return "store_order_message";
    default:
      return "chat_message";
  }
}

export function resolveMessageEventTypeFromDirectKey(directKey: string | null | undefined): NotificationEventType {
  const dk = String(directKey ?? "").trim();
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade_message";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "store_order_message";
  return "chat_message";
}

export function adminSoundKeyForEventType(type: NotificationEventType): string {
  return getNotificationEventDefinition(type).legacyAdminSoundKey;
}

export function buildMessageDedupeKey(roomId: string, messageId: string): string {
  return `msg:${roomId.trim()}:${messageId.trim()}`;
}

export function buildMentionDedupeKey(roomId: string, messageId: string, userId: string): string {
  return `mention:${roomId.trim()}:${messageId.trim()}:${userId.trim()}`;
}

export function buildMissedCallDedupeKey(callSessionId: string, userId: string): string {
  return `missed:${callSessionId.trim()}:${userId.trim()}`;
}
