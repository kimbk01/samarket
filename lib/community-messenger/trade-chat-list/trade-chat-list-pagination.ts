/** 거래 채팅 리스트 — 클라이언트 페이지(더보기) 크기 */
export const TRADE_CHAT_LIST_PAGE_SIZE = 15;

/** 더보기 시 버퍼 스피너 최소 노출(ms) — 체감 피드백 */
export const TRADE_CHAT_LIST_LOAD_MORE_MIN_MS = 280;

/** trade meta 배치 hydrate 상한 — 첫 페인트 우선 */
export const TRADE_CHAT_LIST_META_HYDRATE_BATCH_SIZE = 15;

export function sliceTradeChatListPage<T>(items: readonly T[], visibleCount: number): T[] {
  if (visibleCount <= 0) return [];
  return items.slice(0, Math.min(visibleCount, items.length));
}

export function tradeChatListHasMorePages(totalCount: number, visibleCount: number): boolean {
  return visibleCount < totalCount;
}

export function nextTradeChatListVisibleCount(
  current: number,
  totalCount: number,
  pageSize = TRADE_CHAT_LIST_PAGE_SIZE
): number {
  return Math.min(current + pageSize, totalCount);
}
