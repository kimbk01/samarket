export const NOTIFICATION_EVENT_TYPES = [
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "trade_status",
  "order_status",
  "delivery_status",
  "community_activity",
  "admin_marketing_banner",
  "admin_notice",
  "admin_test",
  "missed_call",
  "incoming_call_signal",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_EVENT_CATEGORIES = [
  "chat_message",
  "group_message",
  "trade_message",
  "trade_status",
  "order_status",
  "delivery_status",
  "community_activity",
  "admin_marketing_banner",
  "admin_notice",
  "missed_call",
  "incoming_call_signal",
  /**
   * Legacy categories remain for zero-downtime migration.
   * New writes should use the P0 categories above.
   */
  "chat",
  "group",
  "trade",
  "store",
  "call",
] as const;

export type NotificationEventCategory = (typeof NOTIFICATION_EVENT_CATEGORIES)[number];

export const BADGE_COUNTABLE_CATEGORIES: ReadonlySet<NotificationEventCategory> = new Set([
  "chat_message",
  "group_message",
  "trade_message",
  "trade_status",
  "order_status",
  "delivery_status",
  "community_activity",
  "admin_notice",
  "missed_call",
  // Legacy compatibility
  "chat",
  "group",
  "trade",
  "store",
]);

export type NotificationBadgeCount = {
  total: number;
  chatMessage?: number;
  groupMessage?: number;
  tradeMessage?: number;
  tradeStatus?: number;
  orderStatus?: number;
  deliveryStatus?: number;
  communityActivity?: number;
  adminMarketingBanner?: number;
  adminNotice?: number;
  missedCall: number;
  /** Legacy compatibility fields */
  chat: number;
  group: number;
  trade: number;
  store: number;
};

export type NotificationMessageRoomKind =
  | "direct"
  | "group"
  | "trade"
  | "store_order"
  | "trade_legacy";
