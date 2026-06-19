/** 통화목록 UI — `?section=call_logs` · `/community-messenger/calls/logs` */
export function isMessengerCallLogsSurface(pathname: string, section: string | null | undefined): boolean {
  const p = String(pathname ?? "").trim();
  if (p === "/community-messenger/calls/logs" || p.startsWith("/community-messenger/calls/logs/")) {
    return true;
  }
  if (p === "/community-messenger" || p === "/community-messenger/") {
    return String(section ?? "").trim() === "call_logs";
  }
  return false;
}
