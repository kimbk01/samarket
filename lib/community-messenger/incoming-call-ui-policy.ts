import { shouldRunIncomingCallBackupHttpPoll } from "@/lib/layout/incoming-call-backup-poll-policy";

export type IncomingCallVisibilityState = "visible" | "hidden" | "prerender" | "unloaded";

export function isIncomingCallWindowForeground(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible" || document.hidden) return false;
  return typeof document.hasFocus === "function" ? document.hasFocus() : true;
}

export function readIncomingCallVisibilityState(): IncomingCallVisibilityState {
  if (typeof document === "undefined") return "visible";
  const state = String(document.visibilityState);
  return state === "visible" || state === "hidden" || state === "prerender" || state === "unloaded"
    ? state
    : document.hidden
      ? "hidden"
      : "visible";
}

export type IncomingCallAppForegroundInput = {
  isCapacitorNative: boolean;
  visibilityState: IncomingCallVisibilityState;
  capacitorAppActive?: boolean | null;
};

/** Capacitor App.isActive + Page Visibility + focus — Web incoming UI 는 이 조건에서만 허용 */
export function resolveIncomingAppForeground(input: IncomingCallAppForegroundInput): boolean {
  if (input.visibilityState !== "visible") return false;
  if (input.isCapacitorNative && input.capacitorAppActive === false) return false;
  return isIncomingCallWindowForeground();
}

export function isCalleeAcceptCallRoute(path: string): boolean {
  return path.includes("action=accept") || path.includes("callAction=accept");
}

/** FCM persist — ringing hydrate only, accept 아님 */
export function isNativeIncomingHydrateRoute(path: string): boolean {
  const normalized = path.trim();
  if (!normalized.startsWith("/community-messenger/calls/")) return false;
  if (isCalleeAcceptCallRoute(normalized)) return false;
  return normalized.includes("source=native_push");
}

export type ShouldSuppressWebIncomingPresenterInput = IncomingCallAppForegroundInput & {
  /** {@link ForegroundIncomingCallActivity} pill */
  nativeForegroundIncomingCallId?: string | null;
  incomingSessionId?: string | null;
  preferNativeAndroidForegroundIncoming?: boolean;
};

/** Web Global incoming presenter suppress — native/background/lock surface 가 대표일 때. */
export function shouldSuppressWebIncomingPresenter(
  input: ShouldSuppressWebIncomingPresenterInput
): { suppress: boolean; reason: string } {
  const sessionId = input.incomingSessionId?.trim() ?? "";
  const nativeForegroundId = input.nativeForegroundIncomingCallId?.trim() ?? "";

  if (input.isCapacitorNative) {
    if (!resolveIncomingAppForeground(input)) {
      return { suppress: true, reason: "native_background_or_lock" };
    }
    if (nativeForegroundId && (!sessionId || nativeForegroundId === sessionId)) {
      return { suppress: true, reason: "native_foreground_pill_active" };
    }
    if (input.preferNativeAndroidForegroundIncoming) {
      return { suppress: true, reason: "native_foreground_primary" };
    }
    return { suppress: false, reason: "ok" };
  }

  if (!resolveIncomingAppForeground(input)) {
    return { suppress: true, reason: "web_background" };
  }
  return { suppress: false, reason: "ok" };
}

export type ShouldReplayCallPendingRouteInput = {
  visibilityState: IncomingCallVisibilityState;
  capacitorAppActive?: boolean | null;
  nativeForegroundIncomingCallId?: string | null;
};

/**
 * Native pending route replay — accept 는 항상, ringing hydrate(`source=native_push`)는 Web replay 금지.
 */
export function shouldReplayCallPendingRoute(
  path: string,
  input: ShouldReplayCallPendingRouteInput
): { allow: boolean; reason: string } {
  const normalized = path.trim();
  if (!normalized.startsWith("/")) {
    return { allow: false, reason: "invalid_path" };
  }

  if (isCalleeAcceptCallRoute(normalized)) {
    return { allow: true, reason: "accept_route" };
  }

  const foregroundInput: IncomingCallAppForegroundInput = {
    isCapacitorNative: true,
    visibilityState: input.visibilityState,
    capacitorAppActive: input.capacitorAppActive,
  };

  if (isNativeIncomingHydrateRoute(normalized)) {
    const nativeForegroundId = input.nativeForegroundIncomingCallId?.trim() ?? "";
    if (nativeForegroundId) {
      return { allow: false, reason: "native_incoming_surface_active" };
    }
    if (!resolveIncomingAppForeground(foregroundInput)) {
      return { allow: false, reason: "defer_until_app_foreground" };
    }
    return { allow: false, reason: "native_push_hydrate_no_navigation" };
  }

  if (!resolveIncomingAppForeground(foregroundInput)) {
    return { allow: false, reason: "defer_until_app_foreground" };
  }

  return { allow: true, reason: "ok" };
}

export function shouldRunIncomingCallBackupHttpRequest(args: {
  pathname: string | null;
  hasRingingDirectCallee: boolean;
  realtimeOk: boolean;
}): boolean {
  if (!shouldRunIncomingCallBackupHttpPoll(args.pathname, args.hasRingingDirectCallee)) return false;
  /** ringing 중에는 탭이 숨겨져 있어도 취소/상태 동기화를 위해 HTTP 백업을 허용한다. */
  if (args.hasRingingDirectCallee) return true;
  if (!isIncomingCallWindowForeground()) return false;
  /** Realtime·Broadcast·SW 로 목록이 갱신되면 2.4s 백업 GET 은 중단. */
  if (args.realtimeOk) return false;
  return true;
}

