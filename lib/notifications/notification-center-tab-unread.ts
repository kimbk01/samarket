/**
 * Notification Center tab unread sums.
 * Member tabs count A rows only. Owner store is not part of Member NC.
 */
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";

export type NotificationCenterReadFilter = "all" | "unread" | "read";
export type NotificationCenterCategoryKey =
  | "all"
  | "trade"
  | "community"
  | "delivery"
  | "cs"
  | "marketing"
  | "system";

export type NotificationCenterTabUnreadCounts = Readonly<{
  all: number;
  unread: number;
  read: number;
  trade: number;
  community: number;
  delivery: number;
  cs: number;
  marketing: number;
  system: number;
}>;

export const EMPTY_NOTIFICATION_CENTER_TAB_UNREAD: NotificationCenterTabUnreadCounts = {
  all: 0,
  unread: 0,
  read: 0,
  trade: 0,
  community: 0,
  delivery: 0,
  cs: 0,
  marketing: 0,
  system: 0,
};

type CountableInboxRow = {
  is_read?: boolean | null;
  unread?: boolean | null;
  read_at?: string | null;
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  category?: string | null;
  event_type?: string | null;
  bell_presentation_type?: string | null;
};

function isUnreadRow(row: CountableInboxRow): boolean {
  if (row.unread === false) return false;
  if (row.read_at != null && String(row.read_at).trim() !== "") return false;
  if (row.is_read === true) return false;
  return true;
}

/**
 * Build per-tab unread badges from Member A rows only.
 * CONTRACT: 전체 + category tabs show unread digits. Never badge 읽음.
 * Digits are derived from list/read state — not a new badge writer.
 */
export function buildNotificationCenterTabUnreadCounts(input: {
  memberRows: readonly CountableInboxRow[];
  /** @deprecated marketing is A; ignored when memberRows already include A marketing. */
  marketingRows?: readonly CountableInboxRow[];
  /** @deprecated Owner O is not Member NC. Ignored. */
  storeAttention?: number | null;
}): NotificationCenterTabUnreadCounts {
  const unread = input.memberRows.filter(isUnreadRow);
  const totalUnread = unread.length;
  const cat = (tab: "trade" | "community" | "delivery" | "cs" | "marketing" | "system") =>
    unread.filter((r) => matchesNotificationCenterMemberTab(r, tab)).length;

  return {
    all: totalUnread,
    unread: totalUnread,
    read: 0,
    trade: cat("trade"),
    community: cat("community"),
    delivery: cat("delivery"),
    cs: cat("cs"),
    marketing: cat("marketing"),
    system: cat("system"),
  };
}
