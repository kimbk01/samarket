/**
 * Client/server-aligned category matching for Notification Center.
 * Primary read filter (all/unread/read) is separate — see MyNotificationsView.
 * Secondary categories use actual Member A types only. No invented kinds.
 */
export type NotificationCenterCategoryTab =
  | "trade"
  | "community"
  | "delivery"
  | "cs"
  | "marketing"
  | "system";

/** @deprecated use NotificationCenterCategoryTab */
export type NotificationCenterMemberTab = NotificationCenterCategoryTab | "trade" | "delivery" | "system" | "marketing";

type TabMatchRow = {
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function typeTokens(row: TabMatchRow): string[] {
  return [
    norm(row.push_kind),
    norm(row.notification_type),
    norm(row.type),
    norm(row.category),
    norm(row.event_type),
    norm(row.bell_presentation_type),
  ].filter(Boolean);
}

export function matchesNotificationCenterMemberTab(
  row: TabMatchRow,
  tab: NotificationCenterCategoryTab
): boolean {
  const tokens = typeTokens(row);
  const has = (...keys: string[]) => keys.some((k) => tokens.includes(k));

  if (tab === "trade") {
    return has("trade", "trade_status", "trade_message", "status");
  }
  if (tab === "community") {
    return has("community", "community_activity");
  }
  if (tab === "delivery") {
    return has(
      "delivery",
      "commerce",
      "order_status",
      "delivery_status",
      "customer_order_status",
      "customer_order_message"
    );
  }
  if (tab === "cs") {
    return has("inquiry_answered", "inbox_message_received");
  }
  if (tab === "marketing") {
    return has("marketing", "admin_marketing", "admin_marketing_banner");
  }
  // system — notices + orphan missed (explicit A types only)
  return has(
    "system",
    "notice",
    "admin_notice",
    "admin_system",
    "notice_published",
    "system_important",
    "service_notice",
    "security_alert",
    "system_persistent",
    "notice_persistent",
    "missed_call"
  );
}
