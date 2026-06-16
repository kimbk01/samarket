/**
 * call pending route — `dibay_call_pending_route` 단일 소유.
 */

export const DIBAY_CALL_PENDING_ROUTE_KEY = "dibay_call_pending_route";
const PENDING_ROUTE_TTL_MS = 60_000;

export type CallPendingRoute = {
  path: string;
  at: number;
  callId?: string;
};

export function writeCallPendingRoute(path: string, callId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  const normalized = path.trim();
  if (!normalized) return;
  try {
    const payload: CallPendingRoute = {
      path: normalized,
      at: Date.now(),
      ...(callId?.trim() ? { callId: callId.trim() } : {}),
    };
    sessionStorage.setItem(DIBAY_CALL_PENDING_ROUTE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readCallPendingRoute(now = Date.now()): CallPendingRoute | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(DIBAY_CALL_PENDING_ROUTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CallPendingRoute;
    const path = parsed.path?.trim();
    if (!path) return null;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (at > 0 && now - at > PENDING_ROUTE_TTL_MS) {
      clearCallPendingRoute();
      return null;
    }
    return { path, at, callId: parsed.callId?.trim() || undefined };
  } catch {
    return null;
  }
}

export function clearCallPendingRoute(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(DIBAY_CALL_PENDING_ROUTE_KEY);
  } catch {
    /* ignore */
  }
}
