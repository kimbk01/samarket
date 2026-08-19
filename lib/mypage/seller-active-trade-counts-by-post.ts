import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";

/** Active buyer chat rows per listing — from existing `/api/my/sales` payload only. */
export function buildActiveTradeCountByPostId(rows: SalesHistoryRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const postId = String(row.postId ?? "").trim();
    if (!postId) continue;
    const hasChat = Boolean(row.chatId?.trim()) && !row.noActiveChat;
    if (!hasChat) continue;
    map.set(postId, (map.get(postId) ?? 0) + 1);
  }
  return map;
}
