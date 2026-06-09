/**
 * 메신저 통화 기록 — 아래로 스크롤 시 전역 `BottomNav` 접기 표면.
 * 허브 `?section=call_logs` · 독립 `/community-messenger/calls/logs`.
 */

export function isMessengerCallLogsBottomNavScrollHideSurface(
  pathNoQuery: string,
  search: string | null | undefined
): boolean {
  const path = pathNoQuery.trim().replace(/\/+$/, "") || "/";
  if (path === "/community-messenger/calls/logs") return true;
  if (path !== "/community-messenger") return false;
  const section = new URLSearchParams(search ?? "").get("section")?.trim();
  return section === "call_logs";
}
