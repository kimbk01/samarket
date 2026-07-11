"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";
import type { CallV4WebCallScreenReadyPhase } from "@/lib/community-messenger/call-v4/call-v4-native-connecting-handoff";
import {
  exitCallV4ScreenAfterCleanup,
  type CallV4Router,
} from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

const connectingReadyCallIds = new Set<string>();
const connectedReadyCallIds = new Set<string>();

/** Incoming accept handoff only — native outgoing never uses web accept screen-ready. */
const EXIT_DEFER_FALLBACK_MS = 8_000;

const exitDeferFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
  logCallV4("web_call_screen_ready_mark", {
    callId: sid,
    phase,
    wasConnectingReady: connectingReadyCallIds.has(sid),
    wasConnectedReady: connectedReadyCallIds.has(sid),
  });
  if (phase === "connected") {
    connectedReadyCallIds.add(sid);
    connectingReadyCallIds.add(sid);
    clearExitDeferFallback(sid);
    return;
  }
  connectingReadyCallIds.add(sid);
  clearExitDeferFallback(sid);
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
  clearExitDeferFallback(sid);
}

export function resetCallV4WebCallScreenReadyForTests(): void {
  connectingReadyCallIds.clear();
  connectedReadyCallIds.clear();
  for (const sid of exitDeferFallbackTimers.keys()) {
    clearExitDeferFallback(sid);
  }
}

function clearExitDeferFallback(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  const timer = exitDeferFallbackTimers.get(sid);
  if (!timer) return;
  clearTimeout(timer);
  exitDeferFallbackTimers.delete(sid);
  logCallV4("exit_defer_fallback_cleared", { callId: sid });
}

function scheduleExitDeferFallback(callId: string, reason: string, router?: CallV4Router): void {
  const sid = callId.trim();
  if (!sid || exitDeferFallbackTimers.has(sid)) return;
  logCallV4("exit_defer_fallback_scheduled", {
    callId: sid,
    reason,
    timeoutMs: EXIT_DEFER_FALLBACK_MS,
    phase: readCallV4Phase(),
    screenReady: isCallV4WebCallScreenReady(sid),
  });
  const timer = setTimeout(() => {
    exitDeferFallbackTimers.delete(sid);
    if (isCallV4WebCallScreenReady(sid)) {
      logCallV4("exit_defer_fallback_skipped_screen_ready", { callId: sid, reason });
      return;
    }
    logCallV4("exit_defer_fallback_fire", { callId: sid, reason, phase: readCallV4Phase() });
    exitCallV4ScreenAfterCleanup(router);
  }, EXIT_DEFER_FALLBACK_MS);
  exitDeferFallbackTimers.set(sid, timer);
}

function isOutgoingCallerSession(callId: string): boolean {
  const identity = readCallV4Identity();
  return identity?.callId === callId.trim() && identity.direction === "outgoing";
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

  const screenReady = isCallV4WebCallScreenReady(sid);
  if (screenReady) {
    logCallV4("call_screen_ready_before_cleanup", { callId: sid, reason, phase });
    return false;
  }

  if (REMOTE_RING_TERMINAL_REASONS.has(reason)) {
    logCallV4("exit_defer_skipped_remote_ring_terminal", { callId: sid, reason, phase });
    return false;
  }

  const nativeAcceptInflight = isNativeAcceptInflight(sid);
  const outgoingCaller = isOutgoingCallerSession(sid);
  if (reason === "ended" && outgoingCaller) {
    logCallV4("exit_defer_skipped_outgoing_ended", {
      callId: sid,
      reason,
      phase,
      screenReady,
      nativeAcceptInflight,
    });
    return false;
  }

  const preConnectActive = PRE_CONNECT_ACTIVE_PHASES.has(phase) || nativeAcceptInflight;
  if (preConnectActive && (reason === "ended" || nativeAcceptInflight)) {
    logCallV4("cleanup_skipped_until_call_screen_ready", {
      callId: sid,
      reason,
      phase,
      screenReady,
      nativeAcceptInflight,
      outgoingCaller,
    });
    return true;
  }

  logCallV4("exit_defer_not_applied", { callId: sid, reason, phase, screenReady, nativeAcceptInflight });
  return false;
}

export function maybeExitCallV4ScreenAfterCleanup(
  callId: string,
  reason: string,
  router?: CallV4Router,
): void {
  const sid = callId.trim();
  if (!sid) return;
  const defer = shouldDeferCallV4ExitUntilScreenReady({ callId: sid, reason });
  logCallV4("maybe_exit_after_cleanup", { callId: sid, reason, defer, phase: readCallV4Phase() });
  if (defer) {
    scheduleExitDeferFallback(sid, reason, router);
    return;
  }
  clearExitDeferFallback(sid);
  exitCallV4ScreenAfterCleanup(router);
}
