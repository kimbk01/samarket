"use client";

import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import type { CallV3Event, CallV3IncomingPayload, CallV3RemoteEndPayload } from "@/lib/call-v3/call-v3-types";
import { dispatchCallV3StoreEvent } from "@/lib/call-v3/call-v3-store";
import {
  callV3FetchIncomingSessions,
  callV3GetSession,
} from "@/lib/call-v3/call-v3-api";
import { shouldIgnoreSessionRefreshDowngrade } from "@/lib/call-v3/call-v3-state-machine";
import { getCallV3Context } from "@/lib/call-v3/call-v3-store";
import { isCallV3Enabled } from "@/lib/call-v3/call-v3-feature-flag";

export function dispatchCallV3Event(event: CallV3Event): void {
  if (!isCallV3Enabled()) return;
  dispatchCallV3StoreEvent(event);
}

export function sessionToIncomingPayload(session: CommunityMessengerCallSession): CallV3IncomingPayload {
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

export async function refreshCallV3IncomingFromHttp(): Promise<void> {
  if (!isCallV3Enabled()) return;
  const sessions = await callV3FetchIncomingSessions();
  const ringing = sessions.find((s) => s.status === "ringing" && !s.isMineInitiator);
  if (!ringing) return;
  dispatchCallV3Event({ type: "CALL_INCOMING", payload: sessionToIncomingPayload(ringing) });
}

export async function refreshCallV3SessionAuthoritative(sessionId: string): Promise<void> {
  if (!isCallV3Enabled()) return;
  const ctx = getCallV3Context();
  if (ctx.sessionId && ctx.sessionId !== sessionId) return;
  const res = await callV3GetSession(sessionId);
  if (!res.ok || !res.session) return;
  const session = res.session;
  if (shouldIgnoreSessionRefreshDowngrade(ctx, session.status)) return;

  if (session.status === "active" && (ctx.state === "outgoing" || ctx.state === "incoming" || ctx.state === "accepting")) {
    dispatchCallV3Event({ type: "CALL_ACCEPTED", payload: { session } });
  }
  if (session.status === "ended" || session.status === "cancelled") {
    dispatchCallV3Event({
      type: "CALL_REMOTE_ENDED",
      payload: { sessionId, senderId: session.peerUserId, reason: session.endedReason ?? "ended" },
    });
  }
  if (session.status === "rejected") {
    dispatchCallV3Event({ type: "CALL_REJECTED" });
  }
  if (session.status === "missed") {
    dispatchCallV3Event({ type: "CALL_MISSED" });
  }
}

export function parseCallV3RemoteEndFromSignal(row: {
  session_id?: string | null;
  sessionId?: string | null;
  from_user_id?: string | null;
  fromUserId?: string | null;
  payload?: { reason?: string | null } | null;
}): CallV3RemoteEndPayload | null {
  const sessionId = (row.session_id ?? row.sessionId ?? "").trim();
  const senderId = (row.from_user_id ?? row.fromUserId ?? "").trim() || null;
  if (!sessionId) return null;
  return {
    sessionId,
    senderId,
    reason: row.payload?.reason ?? null,
  };
}

export function handleCallV3BroadcastHangup(payload: {
  sessionId?: string | null;
  senderId?: string | null;
  reason?: string | null;
}): void {
  const sessionId = payload.sessionId?.trim();
  if (!sessionId) return;
  dispatchCallV3Event({
    type: "CALL_REMOTE_ENDED",
    payload: {
      sessionId,
      senderId: payload.senderId?.trim() || null,
      reason: payload.reason ?? null,
    },
  });
}

export function handleCallV3NativeBridgeEvent(detail: {
  type?: string;
  sessionId?: string;
  roomId?: string;
  callKind?: "voice" | "video";
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string | null;
}): void {
  if (detail.type === "incoming_call" && detail.sessionId && detail.roomId) {
    dispatchCallV3Event({
      type: "CALL_INCOMING",
      payload: {
        sessionId: detail.sessionId,
        roomId: detail.roomId,
        callKind: detail.callKind ?? "voice",
        peerUserId: detail.callerId?.trim() || "",
        peerLabel: detail.callerName?.trim() || "",
        peerAvatarUrl: detail.callerAvatarUrl ?? null,
      },
    });
  }
}

export function installCallV3NativeEventListener(): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent).detail;
    if (detail && typeof detail === "object") {
      handleCallV3NativeBridgeEvent(detail as Record<string, unknown> as Parameters<typeof handleCallV3NativeBridgeEvent>[0]);
    }
  };
  window.addEventListener("dibay:call-v3-event", handler);
  return () => window.removeEventListener("dibay:call-v3-event", handler);
}

export function handleCallV3AcceptDeepLink(sessionId: string): void {
  dispatchCallV3Event({ type: "CALL_ACCEPT_CLICK" });
  void refreshCallV3SessionAuthoritative(sessionId);
}
