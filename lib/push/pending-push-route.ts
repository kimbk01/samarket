/** Native MainActivity inject + PushRouteListener mount — missed dibay:push-route replay. */

export const PENDING_PUSH_ROUTE_STORAGE_KEY = "dibay_pending_push_route";
export const PENDING_PUSH_ROUTE_TTL_MS = 60_000;

export type PendingPushRoute = {
  path: string;
  notificationId?: string | null;
  at: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readPendingPushRoute(now = Date.now()): PendingPushRoute | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PUSH_ROUTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const path = typeof parsed.path === "string" ? parsed.path.trim() : "";
    if (!path.startsWith("/")) return null;
    const at = typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;
    if (at > 0 && now - at > PENDING_PUSH_ROUTE_TTL_MS) {
      clearPendingPushRoute();
      return null;
    }
    const notificationId =
      typeof parsed.notificationId === "string" ? parsed.notificationId : null;
    return { path, notificationId, at: at || now };
  } catch {
    return null;
  }
}

export function clearPendingPushRoute(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_PUSH_ROUTE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function writePendingPushRoute(route: PendingPushRoute): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_PUSH_ROUTE_STORAGE_KEY, JSON.stringify(route));
  } catch {
    /* ignore */
  }
}
