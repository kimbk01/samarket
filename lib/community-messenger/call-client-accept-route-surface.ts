/**
 * Accept-route surface — remote terminal 이 call_logs 로 밀어내지 않게 하는 단일 guard.
 * `session.status === "ringing"` 일 때만 적용 (서버 확정 terminal 은 별도 경로).
 */
import {
  isIncomingCallAcceptInFlight,
  isIncomingCallRejectInFlight,
} from "@/lib/community-messenger/incoming-call-action-guard";
import { isNativeCalleeAcceptPendingForSession } from "@/lib/community-messenger/native-callee-accept-entry";

export type CalleeAcceptRouteSurfaceGuardInput = {
  sessionId: string;
  sessionStatus: string;
  requestedAction: string | null;
  nativeAcceptOwnedRoute: boolean;
  directPatchInFlight: boolean;
  busy: string | null;
  calleeVideoConnectingShell: boolean;
};

/** 수락 route-first / native accept owned — ringing 중 call_logs dismiss 연기 */
export function shouldDeferCalleeRingingTerminalDismiss(
  input: CalleeAcceptRouteSurfaceGuardInput
): boolean {
  if (input.sessionStatus !== "ringing") return false;
  const sid = input.sessionId.trim();
  if (!sid) return false;
  return (
    isIncomingCallAcceptInFlight(sid) ||
    isIncomingCallRejectInFlight(sid) ||
    input.directPatchInFlight ||
    input.requestedAction === "accept" ||
    input.nativeAcceptOwnedRoute ||
    input.busy === "accept" ||
    input.busy === "join" ||
    input.calleeVideoConnectingShell ||
    isNativeCalleeAcceptPendingForSession(sid)
  );
}
