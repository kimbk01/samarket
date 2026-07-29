/**
 * 메신저 허브 스크롤 목록 — 아래로 스크롤 시 전역 `BottomNav` 접기 표면.
 * 허브 `?section=` (friends · call_logs · chats · archive) · 독립 `/community-messenger/calls/logs`
 * · wide sticky room `/community-messenger/rooms/[id]?section=…`.
 */

const MESSENGER_HUB_SCROLL_HIDE_SECTIONS = new Set([
  "call_logs",
  "friends",
  "chats",
  "archive",
]);

export function isMessengerCallLogsBottomNavScrollHideSurface(
  pathNoQuery: string,
  search: string | null | undefined
): boolean {
  const path = pathNoQuery.trim().replace(/\/+$/, "") || "/";
  if (path === "/community-messenger/calls/logs") return true;
  const section = new URLSearchParams(search ?? "").get("section")?.trim();
  if (path === "/community-messenger") {
    return section != null && MESSENGER_HUB_SCROLL_HIDE_SECTIONS.has(section);
  }
  if (/^\/community-messenger\/rooms\/[^/]+$/.test(path)) {
    return section != null && MESSENGER_HUB_SCROLL_HIDE_SECTIONS.has(section);
  }
  return false;
}
