"use client";

import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { startCallHeartbeatWatchdog } from "@/lib/call/native/call-heartbeat-watchdog";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  evaluateCallV4ConnectedGate,
  isCallV4AcceptPatchJoinableInflight,
  readCallV4ConnectedGateAgoraSignals,
  type CallV4ConnectedGateAgoraSignals,
  type CallV4ConnectedGateInput,
} from "@/lib/community-messenger/call-v4/call-v4-connected-gate";
import { startCallV4ConnectedTerminalWatch } from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

const connectedSideEffectsEntered = new Set<string>();
const nativeConnectedOpsEntered = new Set<string>();

export type CallV4ConnectedGateSignals = CallV4ConnectedGateAgoraSignals;

function buildConnectedGateInput(
  callId: string,
  signals: CallV4ConnectedGateSignals,
): CallV4ConnectedGateInput {
  const identity = readCallV4Identity();
  return {
    callId,
    identityCallId: identity?.callId ?? null,
    mediaType: identity?.mediaType ?? null,
    storePhase: readCallV4Phase(),
    sessionStatus: signals.sessionStatus,
    acceptPatchJoinableInflight: isCallV4AcceptPatchJoinableInflight(callId),
    agoraJoinSuccess: signals.agoraJoinSuccess,
    remoteAudioSubscribed: signals.remoteAudioSubscribed,
    localVideoPublishDone: signals.localVideoPublishDone,
    direction: identity?.direction ?? null,
  };
}

function runConnectedSideEffectsOnce(callId: string, source: string, fromPhase: CallV4Phase): void {
  if (connectedSideEffectsEntered.has(callId)) return;
  connectedSideEffectsEntered.add(callId);
  logCallV4("connected_gate_enter", { callId, source, fromPhase });
  startCallV4ConnectedTerminalWatch(callId);
  startCallHeartbeatWatchdog(callId);
  logCallV4("call_heartbeat_watchdog_start", { callId, source });
}

/** Agora media ready — promote UI from connecting to connected only when Connected Gate SSOT passes. */
export function markCallV4MediaConnected(
  callId: string,
  source: string,
  signals?: CallV4ConnectedGateSignals,
): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, source, trigger: "mark_media_connected" });
    return false;
  }

  const phase = readCallV4Phase();
  if (phase === "connected") return true;

  const resolvedSignals = signals ?? readCallV4ConnectedGateAgoraSignals(sid);
  const gateInput = buildConnectedGateInput(sid, resolvedSignals);
  const gate = evaluateCallV4ConnectedGate(gateInput);
  if (!gate.pass) {
    logCallV4("connected_gate_blocked", {
      callId: sid,
      source,
      reason: gate.reason,
      mediaType: gateInput.mediaType,
      storePhase: gateInput.storePhase,
    });
    return false;
  }

  if (phase === "ending" || phase === "idle") return false;

  const fromPhase = phase;
  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
  logCallV4("connected_gate_pass", {
    callId: sid,
    source,
    fromPhase,
    mediaType: gateInput.mediaType,
  });
  logCallV4("media_connected_phase", { callId: sid, fromPhase, source });
  logCallV4("active_call_connected", { callId: sid, source, fromPhase });
  runConnectedSideEffectsOnce(sid, source, fromPhase);
  return true;
}

/** O3 — Native Runtime connected ops only. Does not use JS Agora Connected Gate. */
export function markCallV4NativeConnectedOps(callId: string, source: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;
  if (nativeConnectedOpsEntered.has(sid)) {
    logCallV4("native_connected_ops_done", { callId: sid, source, mode: "duplicate" });
    return true;
  }
  nativeConnectedOpsEntered.add(sid);
  logCallV4("native_connected_ops_start", { callId: sid, source });
  startCallV4ConnectedTerminalWatch(sid);
  startCallHeartbeatWatchdog(sid);
  logCallV4("call_heartbeat_watchdog_start", { callId: sid, source: "native_connected" });
  logCallV4("native_connected_ops_done", { callId: sid, source });
  return true;
}

export function resetCallV4ConnectedSideEffectsForTests(): void {
  connectedSideEffectsEntered.clear();
  nativeConnectedOpsEntered.clear();
}
