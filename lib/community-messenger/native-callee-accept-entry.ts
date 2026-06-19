/**
 * 수신 수락(`?action=accept`) — 벨 UI·generic auto-join 과 충돌하지 않게 하는 단일 계약.
 *
 * nativePrep=1 — native FGS/알림 정리 완료, Web PATCH 단일 실행.
 */

import { requestCallConnectingSurface } from "@/lib/community-messenger/call-connecting-surface/call-connecting-surface-store";

const NATIVE_CALLEE_ACCEPT_PENDING_KEY = "cm_native_callee_accept_pending";
const NATIVE_CALLEE_ACCEPT_PENDING_TTL_MS = 60_000;
/** accept 경로 밖에서 pending 잔류 시 surface 재표시·ring suppress 정리 */
const NATIVE_CALLEE_ACCEPT_PENDING_OFF_ROUTE_CLEAR_MS = 15_000;

export function isCalleeAcceptLocationPath(pathname: string, search = ""): boolean {
  const path = `${pathname}${search}`;
  return (
    path.includes("action=accept") ||
    path.includes("nativeAccept=1") ||
    path.includes("nativePrep=1")
  );
}

export function isCallSessionLocationForSession(sessionId: string, pathname?: string): boolean {
  const base = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  const match = base.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  return id.length > 0 && id === sessionId.trim();
}

export function isNativeCalleeAcceptPendingOnActiveRoute(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    isCalleeAcceptLocationPath(window.location.pathname, window.location.search) ||
    isCallSessionLocationForSession(sessionId)
  );
}

export type NativeCalleeAcceptRouteParams = {
  action: string | null;
  /** @deprecated nativePrep 사용 */
  nativeAccept: string | null;
  nativePrep: string | null;
};

export function readNativeCalleeAcceptRouteParams(
  searchParams: Pick<URLSearchParams, "get">
): NativeCalleeAcceptRouteParams {
  return {
    action: searchParams.get("action"),
    nativeAccept: searchParams.get("nativeAccept"),
    nativePrep: searchParams.get("nativePrep"),
  };
}

/** native prep 완료 — Web PATCH 는 call-accept-guard 단일 */
export function isNativeCalleePrepRoute(params: NativeCalleeAcceptRouteParams): boolean {
  return params.action === "accept" && (params.nativePrep === "1" || params.nativeAccept === "1");
}

/** @deprecated isNativeCalleePrepRoute */
export function isNativeCalleeAcceptRoute(params: NativeCalleeAcceptRouteParams): boolean {
  return isNativeCalleePrepRoute(params);
}

export function isAnyCalleeAcceptRoute(params: NativeCalleeAcceptRouteParams): boolean {
  return params.action === "accept";
}

/** 수락 직후 IncomingCallView(벨)·수락/거절 버튼 숨김 → connecting 단일 화면 */
export function markNativeCalleeAcceptPending(sessionId: string): void {
  if (typeof sessionStorage === "undefined") return;
  const sid = sessionId.trim();
  if (!sid) return;
  try {
    sessionStorage.setItem(
      NATIVE_CALLEE_ACCEPT_PENDING_KEY,
      JSON.stringify({ sessionId: sid, at: Date.now() })
    );
    if (isNativeCalleeAcceptPendingOnActiveRoute(sid)) {
      requestCallConnectingSurface(sid, "native_callee_accept_pending");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Connecting surface bootstrap — accept·call 세션 URL 에서만 pending 복원.
 * 배달/홈 focus 시 fullscreen overlay 재표시 방지.
 */
export function resolveNativeCalleeAcceptPendingForConnectingSurface(now = Date.now()): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NATIVE_CALLEE_ACCEPT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string; at?: number };
    const sid = parsed.sessionId?.trim();
    if (!sid) return null;
    const at = typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;
    if (at > 0 && now - at > NATIVE_CALLEE_ACCEPT_PENDING_TTL_MS) {
      clearNativeCalleeAcceptPending();
      return null;
    }
    if (!isNativeCalleeAcceptPendingOnActiveRoute(sid)) {
      if (at > 0 && now - at > NATIVE_CALLEE_ACCEPT_PENDING_OFF_ROUTE_CLEAR_MS) {
        clearNativeCalleeAcceptPending(sid);
      }
      return null;
    }
    return sid;
  } catch {
    return null;
  }
}

export function readNativeCalleeAcceptPendingSessionId(now = Date.now()): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(NATIVE_CALLEE_ACCEPT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string; at?: number };
    const sid = parsed.sessionId?.trim();
    if (!sid) return null;
    const at = typeof parsed.at === "number" && Number.isFinite(parsed.at) ? parsed.at : 0;
    if (at > 0 && now - at > NATIVE_CALLEE_ACCEPT_PENDING_TTL_MS) {
      clearNativeCalleeAcceptPending();
      return null;
    }
    return sid;
  } catch {
    return null;
  }
}

export function clearNativeCalleeAcceptPending(sessionId?: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (sessionId?.trim()) {
      const pending = readNativeCalleeAcceptPendingSessionId();
      if (pending && pending !== sessionId.trim()) return;
    }
    sessionStorage.removeItem(NATIVE_CALLEE_ACCEPT_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function isNativeCalleeAcceptPendingForSession(sessionId: string): boolean {
  const pending = readNativeCalleeAcceptPendingSessionId();
  return pending != null && pending === sessionId.trim();
}

export function shouldSuppressCalleeIncomingRingingUi(input: {
  isCallee: boolean;
  joined: boolean;
  acceptRoute: NativeCalleeAcceptRouteParams;
  busyAcceptOrJoin: boolean;
  sessionId?: string | null;
}): boolean {
  if (!input.isCallee || input.joined) return false;
  if (isAnyCalleeAcceptRoute(input.acceptRoute)) return true;
  if (input.sessionId && isNativeCalleeAcceptPendingForSession(input.sessionId)) return true;
  if (input.busyAcceptOrJoin) return true;
  return false;
}

export function shouldDeferCalleeGenericAutoJoin(input: {
  isCallee: boolean;
  joined: boolean;
  joining: boolean;
  acceptRoute: NativeCalleeAcceptRouteParams;
  busyAcceptOrJoin: boolean;
  sessionId?: string | null;
}): boolean {
  if (!input.isCallee || input.joined || input.joining) return false;
  if (isAnyCalleeAcceptRoute(input.acceptRoute)) return true;
  if (input.sessionId && isNativeCalleeAcceptPendingForSession(input.sessionId)) return true;
  if (input.busyAcceptOrJoin) return true;
  return false;
}

export function readNativeCalleeAcceptSessionIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!isNativeCalleePrepRoute({ action: params.get("action"), nativeAccept: params.get("nativeAccept"), nativePrep: params.get("nativePrep") })) {
    return null;
  }
  const match = window.location.pathname.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1]?.trim();
  return id || null;
}
