/**
 * Notification Center / Bell modal tab unread sums.
 * Member tabs count A rows, including persistent marketing; store uses Owner O.
 */
import type { InboxPushKindFilter } from "@/lib/me/fetch-me-notifications-deduped";
import { matchesNotificationCenterMemberTab } from "@/lib/notifications/notification-center-tab-match";

export type NotificationCenterTabKey = InboxPushKindFilter | "store";

export type NotificationCenterTabUnreadCounts = Readonly<{
  all: number;
  trade: number;
  delivery: number;
  system: number;
  marketing: number;
  store: number;
}>;

export const EMPTY_NOTIFICATION_CENTER_TAB_UNREAD: NotificationCenterTabUnreadCounts = {
  all: 0,
  trade: 0,
  delivery: 0,
  system: 0,
  marketing: 0,
  store: 0,
};

type CountableInboxRow = {
  is_read?: boolean | null;
  push_kind?: string | null;
  notification_type?: string | null;
  type?: string | null;
  bell_presentation_type?: string | null;
};

function isUnreadRow(row: CountableInboxRow): boolean {
  return row.is_read !== true;
}

/**
 * Build per-tab unread badges.
 * `memberRows` should already be the surface list (A-filtered, or marketing display rows).
 * `storeAttention` = Owner O (order+inquiry) for the 매장 tab only.
 */
export function buildNotificationCenterTabUnreadCounts(input: {
  memberRows: readonly CountableInboxRow[];
  /** Marketing presentation rows for the dedicated marketing tab. */
  marketingRows?: readonly CountableInboxRow[];
  storeAttention?: number | null;
}): NotificationCenterTabUnreadCounts {
  const memberUnread = input.memberRows.filter(isUnreadRow);
  const marketingUnread = (input.marketingRows ?? []).filter(isUnreadRow);
  const store = Math.max(0, Math.floor(Number(input.storeAttention) || 0));

  const trade = memberUnread.filter((r) => matchesNotificationCenterMemberTab(r, "trade")).length;
  const delivery = memberUnread.filter((r) =>
    matchesNotificationCenterMemberTab(r, "delivery")
  ).length;
  const system = memberUnread.filter((r) => matchesNotificationCenterMemberTab(r, "system")).length;

  return {
    all: memberUnread.length,
    trade,
    delivery,
    system,
    marketing: marketingUnread.length,
    store,
  };
}
