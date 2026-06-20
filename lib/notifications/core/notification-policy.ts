import type {
  NotificationEventCategory,
  NotificationEventType,
  NotificationMessageRoomKind,
} from "@/lib/notifications/core/notification-event-types";

const ADMIN_SOUND_KEY_BY_TYPE: Record<NotificationEventType, string> = {
  chat_message: "message_default",
  group_message: "group_message",
  mention_message: "group_message",
  pin_message: "group_message",
  trade_message: "trade_message",
  store_order_message: "store_order",
  trade_status: "trade_status",
  order_status: "order_status",
  delivery_status: "delivery_status",
  community_activity: "community_activity",
  admin_marketing_banner: "admin_marketing_banner",
  admin_notice: "admin_notice",
  missed_call: "missed_call",
  incoming_call_signal: "incoming_call_ringtone",
};

export function categoryForEventType(type: NotificationEventType): NotificationEventCategory {
  switch (type) {
    case "group_message":
    case "mention_message":
    case "pin_message":
      return "group_message";
    case "trade_message":
      return "trade_message";
    case "store_order_message":
      return "order_status";
    case "trade_status":
      return "trade_status";
    case "order_status":
      return "order_status";
    case "delivery_status":
      return "delivery_status";
    case "community_activity":
      return "community_activity";
    case "admin_marketing_banner":
      return "admin_marketing_banner";
    case "admin_notice":
      return "admin_notice";
    case "missed_call":
      return "missed_call";
    case "incoming_call_signal":
      return "incoming_call_signal";
    default:
      return "chat_message";
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

export function buildMentionDedupeKey(roomId: string, messageId: string, userId: string): string {
  return `mention:${roomId.trim()}:${messageId.trim()}:${userId.trim()}`;
}

export function buildMissedCallDedupeKey(callSessionId: string, userId: string): string {
  return `missed:${callSessionId.trim()}:${userId.trim()}`;
}
