/**
 * 메신저 채팅 표면 — 아래로 스크롤 시 전역 `BottomNav` 접기.
 * 허브(모든 section)·trade/delivery 목록·room·통화 기록.
 */

export function isMessengerBottomNavScrollHideSurface(
  pathNoQuery: string,
  _search?: string | null | undefined
): boolean {
  const path = pathNoQuery.trim().replace(/\/+$/, "") || "/";
  if (path === "/community-messenger") return true;
  if (path === "/community-messenger/trade-chats") return true;
  if (path === "/community-messenger/delivery-chats") return true;
  if (path === "/community-messenger/calls/logs") return true;
  if (/^\/community-messenger\/rooms\/[^/]+$/.test(path)) return true;
  if (/^\/community-messenger\/calls\/[^/]+$/.test(path) && path !== "/community-messenger/calls/outgoing") {
    return false;
  }
  return false;
}

/** @deprecated use {@link isMessengerBottomNavScrollHideSurface} */
export function isMessengerCallLogsBottomNavScrollHideSurface(
  pathNoQuery: string,
  search: string | null | undefined
): boolean {
  return isMessengerBottomNavScrollHideSurface(pathNoQuery, search);
}
