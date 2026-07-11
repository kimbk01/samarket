"use client";

import { callV4HandleRemoteTerminal } from "@/lib/community-messenger/call-v4/call-v4-actions";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import type { CallV4SurfaceOwnerSignal } from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-store";

const VOIP_TERMINAL_REASON_PREFIX = "ios_voip_terminal_";

export function resolveVoipSurfaceTerminalStatus(reason: string): string | null {
  const normalized = reason.trim();
  if (!normalized.startsWith(VOIP_TERMINAL_REASON_PREFIX)) return null;
  const kind = normalized.slice(VOIP_TERMINAL_REASON_PREFIX.length);
  if (kind === "call_ended") return "ended";
  if (kind === "call_rejected") return "rejected";
  if (kind === "call_canceled" || kind === "call_cancelled") return "cancelled";
  return kind || "ended";
}

/** VoIP surface-owner terminal → Web SSOT finalize (idempotent via callV4HandleRemoteTerminal). */
export function maybeFinalizeCallV4FromVoipSurfaceOwnerBridge(signal: CallV4SurfaceOwnerSignal): void {
  const sid = signal.callId.trim();
  if (!sid || signal.owner !== "terminal") return;

  const status = resolveVoipSurfaceTerminalStatus(signal.reason);
  if (!status) return;

  const identity = readCallV4Identity();
  if (identity?.callId !== sid) {
    logCallV4("voip_surface_terminal_skipped", { callId: sid, reason: "not_active_call_id" });
    return;
  }

  void callV4HandleRemoteTerminal(sid, status, readCallV4ExitRouter() ?? undefined, "voip_bridge");
}
