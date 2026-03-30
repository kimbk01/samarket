/**
 * 통합 채팅 상세 URL — 거래·필라이프·일반·매장 주문 모두 `/chats/[roomId]`.
 * 목록 전용 경로(`/chats/philife` 등)는 제외.
 */
export function isUnifiedChatRoomDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const m = /^\/chats\/([^/]+)$/.exec(pathname);
  if (!m) return false;
  const seg = m[1] ?? "";
  return seg !== "new" && seg !== "community" && seg !== "philife" && seg !== "order";
}
