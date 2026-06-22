"use client";

import { callV3HandleRemoteTerminal } from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { readCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import { readCallV3Identity, readCallV3Phase } from "@/lib/community-messenger/call-v3/call-v3-store";
import { subscribeCommunityMessengerCallInviteBroadcast } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { getSupabaseClient } from "@/lib/supabase/client";

const OUTGOING_TERMINAL_PHASES = new Set(["creating", "outgoing_ringing", "joining"]);

function readHangupPayloadStatus(payload: Record<string, unknown>): string {
  const status = typeof payload.status === "string" ? payload.status.trim() : "";
  if (status) return status;
  const terminalStatus = typeof payload.terminalStatus === "string" ? payload.terminalStatus.trim() : "";
  return terminalStatus || "cancelled";
}

function handleCallerTerminalBroadcast(payload: Record<string, unknown>): void {
  const callId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  if (!callId) return;

  const identity = readCallV3Identity();
  const phase = readCallV3Phase();
  if (identity?.direction !== "outgoing" || identity.callId !== callId) return;
  if (!OUTGOING_TERMINAL_PHASES.has(phase)) return;

  const status = readHangupPayloadStatus(payload);
  logCallV3("caller_terminal_broadcast_received", { callId, status });
  void callV3HandleRemoteTerminal(callId, status, readCallV3ExitRouter() ?? undefined);
}

/** Outgoing caller — Realtime invite hangup/terminal on own user channel. */
export function startCallV3CallerTerminalBroadcastSubscribe(userId: string): () => void {
  const uid = userId.trim();
  if (!uid) return () => undefined;

  const sb = getSupabaseClient();
  if (!sb) return () => undefined;

  const channel = subscribeCommunityMessengerCallInviteBroadcast(sb, uid, {
    onRing: () => undefined,
    onHangup: handleCallerTerminalBroadcast,
  });

  return () => {
    try {
      void sb.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}
