/** Native MainActivity inject + PushRouteListener mount — missed dibay:push-route replay. */

export const PENDING_PUSH_ROUTE_STORAGE_KEY = "dibay_pending_push_route";
export const PENDING_PUSH_ROUTE_TTL_MS = 60_000;
/**
 * NOTI-07: 로그아웃 상태에서 알림 탭 → 목적지 보관 후 로그인 대기. 로그인에 시간이
 * 걸리므로 60초 대신 더 긴 보관(제안 5분, Owner 조정 가능).
 */
export const PENDING_PUSH_ROUTE_LOGIN_TTL_MS = 5 * 60_000;

/**
 * Canonical pending only — never store title/body/full FCM payload.
 * Support modal holds use kind=support_modal + caseId (not URL-only authority).
 */
export type PendingPushRoute = {
  path: string;
  kind?: "support_modal" | null;
  caseId?: string | null;
  notificationId?: string | null;
  at: number;
  /** Optional resolve metadata (not product copy). */
  source?: string | null;
  fallbackReason?: string | null;
  /** NOTI-07: 알림 수신자 id — 로그인 후 같은 계정일 때만 이동(다른 계정이면 버림). */
  recipientUserId?: string | null;
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
    // Reject accidental sensitive payload fields if ever written.
    if ("title" in parsed || "body" in parsed || "data" in parsed) {
      clearPendingPushRoute();
      return null;
    }
    const at = typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;
    const source = typeof parsed.source === "string" ? parsed.source : null;
    // NOTI-07: 로그인 대기(auth_required_login)는 더 긴 보관 시간을 적용.
    const applicableTtl =
      source === "auth_required_login" ? PENDING_PUSH_ROUTE_LOGIN_TTL_MS : PENDING_PUSH_ROUTE_TTL_MS;
    if (at > 0 && now - at > applicableTtl) {
      clearPendingPushRoute();
      return null;
    }
    const notificationId =
      typeof parsed.notificationId === "string" ? parsed.notificationId : null;
    const fallbackReason =
      typeof parsed.fallbackReason === "string" ? parsed.fallbackReason : null;
    const kind = parsed.kind === "support_modal" ? "support_modal" : null;
    const caseId = typeof parsed.caseId === "string" ? parsed.caseId.trim() : null;
    const recipientUserId =
      typeof parsed.recipientUserId === "string" ? parsed.recipientUserId.trim() || null : null;
    return {
      path,
      kind,
      caseId: caseId || null,
      notificationId,
      at: at || now,
      source,
      fallbackReason,
      recipientUserId,
    };
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
    const safe: PendingPushRoute = {
      path: route.path.trim(),
      at: route.at || Date.now(),
      kind: route.kind === "support_modal" ? "support_modal" : null,
      caseId: route.caseId?.trim() || null,
      notificationId: route.notificationId ?? null,
      source: route.source ?? null,
      fallbackReason: route.fallbackReason ?? null,
      recipientUserId: route.recipientUserId?.trim() || null,
    };
    if (!safe.path.startsWith("/")) return;
    sessionStorage.setItem(PENDING_PUSH_ROUTE_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    /* ignore */
  }
}

/** Read once then clear — login resume / mount replay. */
export function consumePendingPushRoute(now = Date.now()): PendingPushRoute | null {
  const pending = readPendingPushRoute(now);
  if (!pending) return null;
  clearPendingPushRoute();
  return pending;
}

/**
 * CTA-05: a held route recorded for one account must never replay into another.
 * Discard only on a proven mismatch (recorded recipient vs currently bound user);
 * routes without a recorded recipient keep the existing replay behavior.
 */
export function isPendingPushRouteAccountMismatch(
  pending: Pick<PendingPushRoute, "recipientUserId"> | null | undefined,
  boundUserId: string | null | undefined
): boolean {
  const recipient = (pending?.recipientUserId ?? "").trim();
  const bound = (boundUserId ?? "").trim();
  return Boolean(recipient && bound && recipient !== bound);
}
