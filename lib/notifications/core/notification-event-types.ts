export const NOTIFICATION_EVENT_TYPES = [
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "missed_call",
  "incoming_call",
  "admin_ad",
  "admin_notice",
  "admin_event",
  "admin_system",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const ADMIN_NOTIFICATION_EVENT_TYPES = [
  "admin_ad",
  "admin_notice",
  "admin_event",
  "admin_system",
] as const;

export type AdminNotificationEventType = (typeof ADMIN_NOTIFICATION_EVENT_TYPES)[number];

export function isAdminNotificationEventType(type: string): type is AdminNotificationEventType {
  return (ADMIN_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(type);
}

export const NOTIFICATION_EVENT_CATEGORIES = [
  "chat",
  "group",
  "trade",
  "store",
  "missed_call",
  "call",
  "admin_ad",
  "admin_notice",
  "admin_event",
  "admin_system",
] as const;

export type NotificationEventCategory = (typeof NOTIFICATION_EVENT_CATEGORIES)[number];

export const BADGE_COUNTABLE_CATEGORIES: ReadonlySet<NotificationEventCategory> = new Set([
  "chat",
  "group",
  "trade",
  "store",
  "missed_call",
]);

export type NotificationBadgeCount = {
  total: number;
  chat: number;
  group: number;
  trade: number;
  store: number;
  missedCall: number;
};

export type NotificationMessageRoomKind =
  | "direct"
  | "group"
  | "trade"
  | "store_order"
  | "trade_legacy";
