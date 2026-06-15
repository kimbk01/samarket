/** 통화 cold-start replay — OAuth/chat push key와 분리 */

export const CALL_V3_PENDING_ROUTE_KEY = "dibay_call_pending_route";
export const CALL_V3_PENDING_ROUTE_TTL_MS = 60_000;

export type CallV3PendingRoute = {
  path: string;
  at: number;
};

export function readCallV3PendingRoute(now = Date.now()): CallV3PendingRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CALL_V3_PENDING_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; at?: number };
    const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
    if (!path.startsWith("/")) return null;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (at > 0 && now - at > CALL_V3_PENDING_ROUTE_TTL_MS) {
      clearCallV3PendingRoute();
      return null;
    }
    return { path, at: at || now };
  } catch {
    return null;
  }
}

export function writeCallV3PendingRoute(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CALL_V3_PENDING_ROUTE_KEY,
      JSON.stringify({ path, at: Date.now() } satisfies CallV3PendingRoute)
    );
  } catch {
    /* ignore */
  }
}

export function clearCallV3PendingRoute(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CALL_V3_PENDING_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildCallV3SessionHref(sessionId: string, action?: "accept"): string {
  const base = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  if (action === "accept") return `${base}?action=accept`;
  return base;
}

export function buildCallV3MissedLogsHref(roomId: string, callId?: string): string {
  const q = new URLSearchParams({ roomId });
  if (callId?.trim()) q.set("callId", callId.trim());
  return `/community-messenger/calls/logs?${q.toString()}`;
}
