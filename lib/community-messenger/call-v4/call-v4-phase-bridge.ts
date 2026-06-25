"use client";

import { startCallHeartbeatWatchdog } from "@/lib/call/native/call-heartbeat-watchdog";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { startCallV4ConnectedTerminalWatch } from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

const MEDIA_CONNECTED_PHASES = new Set<CallV4Phase>([
  "creating",
  "outgoing_ringing",
  "incoming_ringing",
  "accepting",
  "joining",
]);

/** Agora media ready — promote UI from connecting to connected when join path missed store update. */
export function markCallV4MediaConnected(callId: string, source: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;

  const identity = readCallV4Identity();
  if (identity?.callId !== sid) return false;

  const phase = readCallV4Phase();
  if (phase === "connected") return true;
  if (phase === "ending" || phase === "idle") return false;
  if (!MEDIA_CONNECTED_PHASES.has(phase)) return false;

  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
  logCallV4("media_connected_phase", { callId: sid, fromPhase: phase, source });
  logCallV4("active_call_connected", { callId: sid, source, fromPhase: phase });
  startCallV4ConnectedTerminalWatch(sid);
  startCallHeartbeatWatchdog(sid);
  logCallV4("call_heartbeat_watchdog_start", { callId: sid, source });
  return true;
}
