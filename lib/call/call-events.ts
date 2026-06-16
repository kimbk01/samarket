"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import type { CallEvent, CallIncomingPayload, CallRemoteEndPayload } from "@/lib/call/call-types";
import { dispatchCallStoreEvent, getCallContext } from "@/lib/call/call-store";
import { callFetchIncomingSessions, callGetSession } from "@/lib/call/call-api";
import { shouldIgnoreSessionRefreshDowngrade } from "@/lib/call/call-state-machine";

export function dispatchCallEvent(event: CallEvent): void {
  dispatchCallStoreEvent(event);
}

export function sessionToIncomingPayload(session: CommunityMessengerCallSession): CallIncomingPayload {
  return {
    sessionId: session.id,
    roomId: session.roomId,
    callKind: session.callKind,
    peerUserId: session.peerUserId?.trim() || session.initiatorUserId,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl,
    startedAt: session.startedAt,
    session,
  };
}

export async function refreshCallIncomingFromHttp(): Promise<void> {
  const sessions = await callFetchIncomingSessions();
  const ringing = sessions.find((s) => s.status === "ringing" && !s.isMineInitiator);
  if (!ringing) return;
  dispatchCallEvent({ type: "CALL_INCOMING", payload: sessionToIncomingPayload(ringing) });
}

export async function refreshCallSessionAuthoritative(sessionId: string): Promise<void> {
  const ctx = getCallContext();
  if (ctx.sessionId && ctx.sessionId !== sessionId) return;
  const res = await callGetSession(sessionId);
  if (!res.ok || !res.session) return;
  const session = res.session;
  if (shouldIgnoreSessionRefreshDowngrade(ctx, session.status)) return;

  if (
    session.status === "active" &&
    (ctx.state === "outgoing" || ctx.state === "incoming" || ctx.state === "accepting")
  ) {
    dispatchCallEvent({ type: "CALL_ACCEPTED", payload: { session } });
  }
  if (session.status === "ended" || session.status === "cancelled") {
    dispatchCallEvent({
      type: "CALL_REMOTE_ENDED",
      payload: { sessionId, senderId: session.peerUserId, reason: session.endedReason ?? "ended" },
    });
  }
  if (session.status === "rejected") {
    dispatchCallEvent({ type: "CALL_REJECTED" });
  }
  if (session.status === "missed") {
    dispatchCallEvent({ type: "CALL_MISSED" });
  }
}

export function parseCallRemoteEndFromSignal(row: {
  session_id?: string | null;
  sessionId?: string | null;
  from_user_id?: string | null;
  fromUserId?: string | null;
  payload?: { reason?: string | null } | null;
}): CallRemoteEndPayload | null {
  const sessionId = (row.session_id ?? row.sessionId ?? "").trim();
  const senderId = (row.from_user_id ?? row.fromUserId ?? "").trim() || null;
  if (!sessionId) return null;
  return {
    sessionId,
    senderId,
    reason: row.payload?.reason ?? null,
  };
}

export function handleCallBroadcastHangup(payload: {
  sessionId?: string | null;
  senderId?: string | null;
  reason?: string | null;
}): void {
  const sessionId = payload.sessionId?.trim();
  if (!sessionId) return;
  dispatchCallEvent({
    type: "CALL_REMOTE_ENDED",
    payload: {
      sessionId,
      senderId: payload.senderId?.trim() || null,
      reason: payload.reason ?? null,
    },
  });
}

export function handleCallAcceptDeepLink(sessionId: string): void {
  dispatchCallEvent({ type: "CALL_ACCEPT_CLICK" });
  void refreshCallSessionAuthoritative(sessionId);
}
