export const NOTIFICATION_EVENT_TYPES = [
  "chat_message",
  "group_message",
  "trade_message",
  "store_order_message",
  "missed_call",
  "incoming_call",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_EVENT_CATEGORIES = [
  "chat",
  "group",
  "trade",
  "store",
  "missed_call",
  "call",
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
