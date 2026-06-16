/** 통화 cold-start replay — OAuth/chat push key와 분리 */

export const CALL_PENDING_ROUTE_KEY = "dibay_call_pending_route";
export const CALL_PENDING_ROUTE_TTL_MS = 60_000;

export type CallPendingRoute = {
  path: string;
  at: number;
};

export function readCallPendingRoute(now = Date.now()): CallPendingRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CALL_PENDING_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { path?: string; at?: number };
    const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
    if (!path.startsWith("/")) return null;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (at > 0 && now - at > CALL_PENDING_ROUTE_TTL_MS) {
      clearCallPendingRoute();
      return null;
    }
    return { path, at: at || now };
  } catch {
    return null;
  }
}

export function writeCallPendingRoute(path: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      CALL_PENDING_ROUTE_KEY,
      JSON.stringify({ path, at: Date.now() } satisfies CallPendingRoute)
    );
  } catch {
    /* ignore */
  }
}

export function clearCallPendingRoute(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CALL_PENDING_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildCallSessionHref(sessionId: string, action?: "accept"): string {
  const base = `/community-messenger/calls/${encodeURIComponent(sessionId)}`;
  if (action === "accept") return `${base}?action=accept`;
  return base;
}

export function buildCallMissedLogsHref(roomId: string, callId?: string): string {
  const q = new URLSearchParams({ roomId });
  if (callId?.trim()) q.set("callId", callId.trim());
  return `/community-messenger/calls/logs?${q.toString()}`;
}
