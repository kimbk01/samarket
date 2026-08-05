/**
 * Phase 2 — member notices list helper (legacy).
 * Settings API no longer merges push inbox; board SSOT only.
 * KEEP file until Phase 7 REPLACE/REMOVE of unused merge helper.
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
