"use client";

import { claimCallTerminalPatch } from "@/lib/community-messenger/call-terminal-patch-dedupe";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { runCallEnginePatchAction } from "@/lib/community-messenger/call-engine/call-engine-actions";
import { postCommunityMessengerCallHangupSignal } from "@/lib/community-messenger/call-http-actions";

function terminalPatchAction(
  session: CommunityMessengerCallSession,
): "cancel" | "reject" | "end" | null {
  if (session.status === "ringing") {
    return session.isMineInitiator ? "cancel" : "reject";
  }
  if (session.status === "active") return "end";
  return null;
}

/**
 * 탭 닫기·새로고침 직전 — ringing 만 keepalive PATCH.
 * CallEngine action lock 경유 (raw fetch 금지).
 */
export function bestEffortKeepaliveCallSessionTeardown(args: {
  session: CommunityMessengerCallSession;
  durationSeconds: number;
}): void {
  if (typeof window === "undefined") return;
  const action = terminalPatchAction(args.session);
  if (!action || action === "end") return;

  const sid = args.session.id.trim();
  if (!sid) return;
  if (!claimCallTerminalPatch(sid, action)) return;

  void runCallEnginePatchAction({
    callId: sid,
    action,
    source: "page_leave_keepalive",
  }).catch(() => {});

  const peer = args.session.peerUserId?.trim();
  if (!peer) return;
  void postCommunityMessengerCallHangupSignal({
    sessionId: sid,
    toUserId: peer,
    reason: action === "cancel" ? "cancel" : "reject",
  }).catch(() => {});
}

export { terminalPatchAction };

/** 수락·연결 중 pagehide/visibility 가 callee ringing reject PATCH 를 쏘지 않게 */
export function shouldSkipRingingCallSessionPageLeaveTeardown(input: {
  sessionId: string;
  acceptInFlight: boolean;
  rejectInFlight: boolean;
  directPatchInFlight: boolean;
  joining: boolean;
  requestedActionAccept: boolean;
  busyAcceptOrJoin: boolean;
  calleeConnectingShell: boolean;
  nativeAcceptPending: boolean;
}): boolean {
  if (!input.sessionId.trim()) return true;
  if (input.acceptInFlight || input.rejectInFlight) return true;
  if (input.directPatchInFlight || input.joining) return true;
  if (input.requestedActionAccept || input.busyAcceptOrJoin) return true;
  if (input.calleeConnectingShell || input.nativeAcceptPending) return true;
  return false;
}
