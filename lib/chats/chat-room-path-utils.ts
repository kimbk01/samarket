/**
 * 통합 채팅 상세 URL — 거래·일반·매장 주문 모두 `/chats/[roomId]`.
 * 목록 전용 경로는 제외.
 */
export function isUnifiedChatRoomDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const m = /^\/chats\/([^/]+)$/.exec(pathname);
  if (!m) return false;
  const seg = m[1] ?? "";
  return seg !== "new" && seg !== "order";
}

/**
 * `GlobalOrderChatUnreadSound` 등 — 허브 배지 스냅샷 **기준선을 다시 잡을 표면 구간**만 구분.
 * 동일 구간(예: `/stores/a` → `/stores/b`)에서는 pathname 전체가 바뀌어도 키가 같다.
 */
export function orderChatUnreadSoundBaselineKey(pathname: string | null): string {
  if (!pathname) return "";
  const p = pathname.split("?")[0] ?? "";
  if (isUnifiedChatRoomDetailPath(p)) return "chats:room";
  if (/^\/community-messenger\/rooms\/[^/]+\/?$/.test(p)) return "cm:room";
  if (/^\/mypage\/trade\/chat\/[^/]+\/?$/.test(p)) return "trade:room";
  if (p === "/community-messenger" || p.startsWith("/community-messenger/")) return "cm:surface";
  if (p.startsWith("/mypage/trade/chat")) return "trade:hub";
  /** `/mypage` 는 `startsWith("/my")` 와 겹치므로 반드시 `/my` 보다 먼저 분기 */
  if (p.startsWith("/mypage")) return "mypage";
  if (p.startsWith("/chats")) return "chats:hub";
  if (p === "/my" || p.startsWith("/my/")) return "my";
  if (p.startsWith("/stores")) return "stores";
  if (p.startsWith("/orders")) return "orders";
  if (p.startsWith("/philife")) return "philife";
  if (p === "/home" || p.startsWith("/market")) return "trade:feed";
  if (p.startsWith("/community")) return "community";
  return "other";
}
