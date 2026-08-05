/** Customer Center notice detail path — Bell/Campaign deep link target (Phase 2). */
export function buildAppNoticeDetailPath(noticeId: string): string {
  const id = noticeId.trim();
  return `/mypage/notices/${encodeURIComponent(id)}`;
}

export function parseAppNoticeIdFromBoardListId(listId: string): string | null {
  const raw = listId.trim();
  if (raw.startsWith("board:")) {
    const id = raw.slice("board:".length).trim();
    return id || null;
  }
  return raw || null;
}
