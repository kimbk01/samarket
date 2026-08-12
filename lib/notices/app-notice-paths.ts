import { buildLegacyAppNoticeDetailPath } from "@/lib/notices/customer-center-content-paths";

/**
 * Legacy Bell/Campaign deep link target.
 * Canonical PATH boards: buildCustomerCenterBoardDetailPath(contentType, id).
 * Do not remove until all callers migrate (OWNER bridge rule).
 */
export function buildAppNoticeDetailPath(noticeId: string): string {
  return buildLegacyAppNoticeDetailPath(noticeId);
}

export function parseAppNoticeIdFromBoardListId(listId: string): string | null {
  const raw = listId.trim();
  if (raw.startsWith("board:")) {
    const id = raw.slice("board:".length).trim();
    return id || null;
  }
  return raw || null;
}
