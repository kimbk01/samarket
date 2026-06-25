"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import type { CallV4WebCallScreenReadyPhase } from "@/lib/community-messenger/call-v4/call-v4-native-connecting-handoff";
import {
  exitCallV4ScreenAfterCleanup,
  type CallV4Router,
} from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

const connectingReadyCallIds = new Set<string>();
const connectedReadyCallIds = new Set<string>();

const PRE_CONNECT_ACTIVE_PHASES = new Set<CallV4Phase>([
  "incoming_ringing",
  "accepting",
  "joining",
  "creating",
  "outgoing_ringing",
]);

/** Remote ring terminal — allow exit even before web call screen handoff. */
const REMOTE_RING_TERMINAL_REASONS = new Set([
  "rejected",
  "declined",
  "missed",
  "cancelled",
  "canceled",
  "failed",
  "failed_or_stale",
]);

export function markCallV4WebCallScreenReady(callId: string, phase: CallV4WebCallScreenReadyPhase): void {
  const sid = callId.trim();
  if (!sid) return;
  if (phase === "connected") {
    connectedReadyCallIds.add(sid);
    connectingReadyCallIds.add(sid);
    return;
  }
  connectingReadyCallIds.add(sid);
}

export function isCallV4WebCallScreenReady(callId: string): boolean {
  const sid = callId.trim();
  return connectingReadyCallIds.has(sid) || connectedReadyCallIds.has(sid);
}

export function isCallV4WebCallScreenConnectedReady(callId: string): boolean {
  return connectedReadyCallIds.has(callId.trim());
}

export function clearCallV4WebCallScreenReady(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  connectingReadyCallIds.delete(sid);
  connectedReadyCallIds.delete(sid);
}

export function resetCallV4WebCallScreenReadyForTests(): void {
  connectingReadyCallIds.clear();
  connectedReadyCallIds.clear();
}

export function shouldDeferCallV4ExitUntilScreenReady(input: {
  callId: string;
  reason: string;
  phase?: CallV4Phase;
}): boolean {
  const sid = input.callId.trim();
  if (!sid) return false;

  const reason = input.reason.trim().toLowerCase();
  const phase = input.phase ?? readCallV4Phase();

  if (isCallV4WebCallScreenReady(sid)) {
    logCallV4("call_screen_ready_before_cleanup", { callId: sid, reason, phase });
    return false;
  }

  if (REMOTE_RING_TERMINAL_REASONS.has(reason)) {
    return false;
  }

  const nativeAcceptInflight = isNativeAcceptInflight(sid);
  const preConnectActive = PRE_CONNECT_ACTIVE_PHASES.has(phase) || nativeAcceptInflight;
  if (preConnectActive && (reason === "ended" || nativeAcceptInflight)) {
    logCallV4("cleanup_skipped_until_call_screen_ready", { callId: sid, reason, phase });
    return true;
  }

  return false;
}

export function maybeExitCallV4ScreenAfterCleanup(
  callId: string,
  reason: string,
  router?: CallV4Router,
): void {
  if (shouldDeferCallV4ExitUntilScreenReady({ callId, reason })) return;
  exitCallV4ScreenAfterCleanup(router);
}
