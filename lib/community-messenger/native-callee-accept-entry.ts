/**
 * 수신 수락(`?action=accept`) — 벨 UI·generic auto-join 과 충돌하지 않게 하는 단일 계약.
 */

export type NativeCalleeAcceptRouteParams = {
  action: string | null;
  nativeAccept: string | null;
};

export function readNativeCalleeAcceptRouteParams(
  searchParams: Pick<URLSearchParams, "get">
): NativeCalleeAcceptRouteParams {
  return {
    action: searchParams.get("action"),
    nativeAccept: searchParams.get("nativeAccept"),
  };
}

export function isNativeCalleeAcceptRoute(params: NativeCalleeAcceptRouteParams): boolean {
  return params.action === "accept" && params.nativeAccept === "1";
}

export function isAnyCalleeAcceptRoute(params: NativeCalleeAcceptRouteParams): boolean {
  return params.action === "accept";
}

/** 수락 직후 IncomingCallView(벨)·수락/거절 버튼 숨김 → connecting 단일 화면 */
export function shouldSuppressCalleeIncomingRingingUi(input: {
  isCallee: boolean;
  joined: boolean;
  acceptRoute: NativeCalleeAcceptRouteParams;
  busyAcceptOrJoin: boolean;
}): boolean {
  if (!input.isCallee || input.joined) return false;
  if (isAnyCalleeAcceptRoute(input.acceptRoute)) return true;
  if (input.busyAcceptOrJoin) return true;
  return false;
}

/** 수락 플로우가 generic active auto-join 과 경쟁하지 않게 */
export function shouldDeferCalleeGenericAutoJoin(input: {
  isCallee: boolean;
  joined: boolean;
  joining: boolean;
  acceptRoute: NativeCalleeAcceptRouteParams;
  busyAcceptOrJoin: boolean;
}): boolean {
  if (!input.isCallee || input.joined || input.joining) return false;
  if (isAnyCalleeAcceptRoute(input.acceptRoute)) return true;
  if (input.busyAcceptOrJoin) return true;
  return false;
}

export function readNativeCalleeAcceptSessionIdFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (!isNativeCalleeAcceptRoute({ action: params.get("action"), nativeAccept: params.get("nativeAccept") })) {
    return null;
  }
  const match = window.location.pathname.match(/^\/community-messenger\/calls\/([^/?#]+)/);
  const id = match?.[1]?.trim();
  return id || null;
}
