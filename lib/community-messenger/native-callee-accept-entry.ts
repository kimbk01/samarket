/**
 * 수신 수락(`?action=accept`) — 벨 UI·generic auto-join 과 충돌하지 않게 하는 단일 계약.
 *
 * nativePrep=1 — native FGS/알림 정리 완료, Web PATCH 단일 실행.
 */

import {
  clearCallEngineNativeAcceptPending,
  readCallEngineNativeAcceptPending,
  writeCallEngineNativeAcceptPending,
} from "@/lib/community-messenger/call-engine";

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
  writeCallEngineNativeAcceptPending(sessionId);
}

export function readNativeCalleeAcceptPendingSessionId(now = Date.now()): string | null {
  return readCallEngineNativeAcceptPending(now);
}

export function clearNativeCalleeAcceptPending(sessionId?: string): void {
  if (sessionId?.trim()) {
    const pending = readNativeCalleeAcceptPendingSessionId();
    if (pending && pending !== sessionId.trim()) return;
  }
  clearCallEngineNativeAcceptPending();
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
