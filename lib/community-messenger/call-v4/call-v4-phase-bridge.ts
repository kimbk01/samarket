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
import { callV4PatchConnected } from "@/lib/community-messenger/call-v4/call-v4-api";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { acquireConnectedVideoScreenAwake } from "@/lib/call/native/screen-awake-bridge";
import { markCallSessionMediaConnectedForHeartbeat } from "@/lib/call/call-server-heartbeat-client";

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
  if (gateInput.mediaType === "video") {
    acquireConnectedVideoScreenAwake(sid, source);
  }
  // CUT6 — propose server connected_at (server clock). Native change = NONE.
  // C-14 — 유실 시 통화 시간 0 영구 기록 → 최대 3회 backoff 재시도 + 이후 heartbeat 에 mediaConnected 동봉.
  markCallSessionMediaConnectedForHeartbeat(sid);
  void patchCallV4ConnectedWithRetry(sid);
  return true;
}

/** C-14 — connected PATCH 재시도 간격(1s → 2s → 4s). 최초 1회 + 재시도 최대 3회. */
export const CALL_V4_CONNECTED_PATCH_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

/** 재시도해도 결과가 같은 서버 거절 — 즉시 중단 */
const CONNECTED_PATCH_NON_RETRYABLE_ERRORS = new Set([
  "bad_action",
  "forbidden",
  "not_accepted",
  "not_found",
  "answered_elsewhere",
  "session_required",
]);

function isConnectedPatchStillWanted(callId: string): boolean {
  return readCallV4Identity()?.callId === callId && readCallV4Phase() === "connected";
}

export async function patchCallV4ConnectedWithRetry(
  callId: string,
  deps: {
    patch?: typeof callV4PatchConnected;
    sleep?: (ms: number) => Promise<void>;
    delaysMs?: readonly number[];
  } = {},
): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return false;
  const patch = deps.patch ?? callV4PatchConnected;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const delays = deps.delaysMs ?? CALL_V4_CONNECTED_PATCH_RETRY_DELAYS_MS;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (attempt > 0) {
      await sleep(delays[attempt - 1] ?? 0);
      if (!isConnectedPatchStillWanted(sid)) {
        logCallV4("connected_patch_retry_skipped", { callId: sid, attempt, reason: "not_connected" });
        return false;
      }
      logCallV4("connected_patch_retry", { callId: sid, attempt });
    }
    let error: string | null = null;
    try {
      const result = await patch(sid);
      if (result.ok) return true;
      error = result.error ?? "unknown";
    } catch (err: unknown) {
      error = err instanceof Error ? `throw:${err.message}` : "throw";
    }
    if (error && CONNECTED_PATCH_NON_RETRYABLE_ERRORS.has(error)) {
      logCallV4("connected_patch_retry_stop", { callId: sid, attempt, error });
      return false;
    }
  }
  logCallV4("connected_patch_retry_exhausted", { callId: sid });
  return false;
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
