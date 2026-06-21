"use client";

import { claimCallTerminalPatch } from "@/lib/community-messenger/call-terminal-patch-dedupe";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function terminalPatchAction(
  session: CommunityMessengerCallSession
): "cancel" | "reject" | "end" | null {
  if (session.status === "ringing") {
    return session.isMineInitiator ? "cancel" : "reject";
  }
  if (session.status === "active") return "end";
  return null;
}

/**
 * 탭 닫기·새로고침 직전 — ringing 만 keepalive PATCH.
 * active 는 F5 복구를 깨지 않게 pagehide 에서 end 하지 않음 (상대 `user-left`·logout 이 정리).
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

  const body = JSON.stringify({ action });

  try {
    void fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "include",
    });
  } catch {
    /* unloading */
  }

  const peer = args.session.peerUserId?.trim();
  if (!peer) return;
  try {
    void fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sid)}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        toUserId: peer,
        signalType: "hangup",
        payload: { reason: action === "cancel" ? "cancel" : "reject" },
      }),
    });
  } catch {
    /* unloading */
  }
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
