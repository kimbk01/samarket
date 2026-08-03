/**
 * Client/server-aligned tab matching for Notification Center chips.
 * Keep in sync with `matchesInboxPushKind` (system includes notice/admin_notice).
 */
export type NotificationCenterMemberTab = "trade" | "delivery" | "system" | "marketing";

type TabMatchRow = {
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  bell_presentation_type?: string | null;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function matchesNotificationCenterMemberTab(
  row: TabMatchRow,
  tab: NotificationCenterMemberTab
): boolean {
  const pk = norm(row.push_kind);
  const nt = norm(row.notification_type) || norm(row.type);
  const bell = norm(row.bell_presentation_type);

  if (tab === "trade") {
    return (
      pk === "trade" ||
      nt === "status" ||
      bell === "trade_status" ||
      bell === "trade_message"
    );
  }
  if (tab === "delivery") {
    return (
      pk === "delivery" ||
      nt === "commerce" ||
      bell === "order_status" ||
      bell === "delivery_status" ||
      bell === "customer_order_status" ||
      bell === "customer_order_message"
    );
  }
  if (tab === "marketing") {
    return (
      pk === "marketing" ||
      nt === "admin_marketing_banner" ||
      bell === "admin_marketing_banner"
    );
  }
  // system — persistent notices + misc system (not chat)
  return (
    pk === "system" ||
    pk === "notice" ||
    pk === "community" ||
    nt === "system" ||
    bell === "admin_notice" ||
    bell === "system_important" ||
    bell === "missed_call"
  );
}
