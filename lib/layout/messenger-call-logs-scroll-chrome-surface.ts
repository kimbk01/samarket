/**
 * 메신저 허브 스크롤 목록 — 아래로 스크롤 시 전역 `BottomNav` 접기 표면.
 * 허브 `?section=call_logs` · `?section=friends` · 독립 `/community-messenger/calls/logs`.
 */

const MESSENGER_HUB_SCROLL_HIDE_SECTIONS = new Set(["call_logs", "friends"]);

export function isMessengerCallLogsBottomNavScrollHideSurface(
  pathNoQuery: string,
  search: string | null | undefined
): boolean {
  const path = pathNoQuery.trim().replace(/\/+$/, "") || "/";
  if (path === "/community-messenger/calls/logs") return true;
  if (path !== "/community-messenger") return false;
  const section = new URLSearchParams(search ?? "").get("section")?.trim();
  return section != null && MESSENGER_HUB_SCROLL_HIDE_SECTIONS.has(section);
}
