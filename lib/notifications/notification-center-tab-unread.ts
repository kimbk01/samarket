/**
 * Notification Center tab unread sums.
 * Member tabs count A rows only. Owner store is not part of Member NC.
 * Badge digits use the same domain classifier as tab filter / row labels.
 */
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";

export type NotificationCenterReadFilter = "all" | "unread" | "read";
export type NotificationCenterCategoryKey =
  | "all"
  | "notice"
  | "trade"
  | "community"
  | "delivery"
  | "marketing"
  | "system";

export type NotificationCenterTabUnreadCounts = Readonly<{
  all: number;
  unread: number;
  read: number;
  notice: number;
  trade: number;
  community: number;
  delivery: number;
  marketing: number;
  system: number;
}>;

export const EMPTY_NOTIFICATION_CENTER_TAB_UNREAD: NotificationCenterTabUnreadCounts = {
  all: 0,
  unread: 0,
  read: 0,
  notice: 0,
  trade: 0,
  community: 0,
  delivery: 0,
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
  campaign_type?: string | null;
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
 */
export function buildNotificationCenterTabUnreadCounts(input: {
  memberRows: readonly CountableInboxRow[];
  /** @deprecated marketing is A; ignored when memberRows already include A marketing. */
  marketingRows?: readonly CountableInboxRow[];
  /** @deprecated Owner O is not Member NC. Ignored. */
  storeAttention?: number | null;
}): NotificationCenterTabUnreadCounts {
  void input.marketingRows;
  void input.storeAttention;
  const unread = input.memberRows.filter(isUnreadRow);
  const totalUnread = unread.length;
  const cat = (
    tab: "notice" | "trade" | "community" | "delivery" | "marketing" | "system"
  ) => unread.filter((r) => matchesNotificationCenterMemberTab(r, tab)).length;

  return {
    all: totalUnread,
    unread: totalUnread,
    read: 0,
    notice: cat("notice"),
    trade: cat("trade"),
    community: cat("community"),
    delivery: cat("delivery"),
    marketing: cat("marketing"),
    system: cat("system"),
  };
}
