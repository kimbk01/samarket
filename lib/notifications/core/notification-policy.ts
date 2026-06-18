import type {
  NotificationEventCategory,
  NotificationEventType,
  NotificationMessageRoomKind,
} from "@/lib/notifications/core/notification-event-types";

const ADMIN_SOUND_KEY_BY_TYPE: Record<NotificationEventType, string> = {
  chat_message: "message_default",
  group_message: "group_message",
  trade_message: "trade_message",
  store_order_message: "store_order",
  missed_call: "missed_call",
  incoming_call: "incoming_call_ringtone",
};

export function categoryForEventType(type: NotificationEventType): NotificationEventCategory {
  switch (type) {
    case "group_message":
      return "group";
    case "trade_message":
      return "trade";
    case "store_order_message":
      return "store";
    case "missed_call":
      return "missed_call";
    case "incoming_call":
      return "call";
    default:
      return "chat";
  }
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
  return ADMIN_SOUND_KEY_BY_TYPE[type];
}

export function buildMessageDedupeKey(roomId: string, messageId: string): string {
  return `msg:${roomId.trim()}:${messageId.trim()}`;
}

export function buildMissedCallDedupeKey(callSessionId: string, userId: string): string {
  return `missed:${callSessionId.trim()}:${userId.trim()}`;
}
