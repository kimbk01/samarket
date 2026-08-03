/**
 * Phase 2 — member notices SSOT merge.
 * Board (`app_notices`) + push inbox (`notification_events` admin_notice, non-marketing).
 */
export type MemberNoticeListItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  /** board = app_notices; push = notification_events */
  source: "board" | "push";
  /** Present for push rows — open /notifications/[id] */
  notificationId?: string | null;
  campaignType?: "notice" | "system" | null;
  isRead?: boolean;
};

export function mergeMemberNoticeListItems(input: {
  board: readonly MemberNoticeListItem[];
  push: readonly MemberNoticeListItem[];
  limit?: number;
}): MemberNoticeListItem[] {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit) || 40)));
  const merged = [...input.push, ...input.board].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  );
  return merged.slice(0, limit);
}
