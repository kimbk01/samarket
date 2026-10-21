"use client";

import type { CallV4CallerPollFetchResult } from "@/lib/community-messenger/call-v4/call-v4-api";
import { subscribeCallV4SessionStatus } from "@/lib/community-messenger/call-v4/call-v4-session-status-poller";
import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { maybeExitCallV4ScreenAfterCleanup } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase, CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";

const CALLER_POLL_OUTGOING_PHASES = new Set<CallV4Phase>(["creating", "outgoing_ringing"]);

const CALLER_TERMINAL_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "ended",
  "missed",
  "failed",
]);

/** C-12 — 공유 poller(callId 당 1개, 1초) 구독 해제 함수 */
let callerActivePollUnsubscribe: (() => void) | null = null;
let callerActivePollCallId: string | null = null;

export function stopCallV4CallerActivePoll(): void {
  const unsubscribe = callerActivePollUnsubscribe;
  callerActivePollUnsubscribe = null;
  callerActivePollCallId = null;
  unsubscribe?.();
}

function isCallerPollOutgoingPhase(phase: CallV4Phase): boolean {
  return CALLER_POLL_OUTGOING_PHASES.has(phase);
}

function isCallerTerminalStatus(status: string | null | undefined): boolean {
  return CALLER_TERMINAL_STATUSES.has((status ?? "").trim().toLowerCase());
}

function mapCallerTerminalStatus(status: string): CallV4TerminalPhase {
  const normalized = status.trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  return "cancelled";
}

async function applyCallerRemoteTerminal(callId: string, status: string): Promise<void> {
  const sid = callId.trim();
  if (!sid || readCallV4Identity()?.callId !== sid) return;

  logCallV4("remote_terminal_received", { callId: sid, status });
  stopCallV4CallerActivePoll();
  await cleanupCallV4(sid, mapCallerTerminalStatus(status));
  maybeExitCallV4ScreenAfterCleanup(sid, status, readCallV4ExitRouter() ?? undefined);
}

async function handleCallerPollFetchResult(callId: string, fetchResult: CallV4CallerPollFetchResult): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return true;

  if (fetchResult.notFound) {
    logCallV4("caller_poll_session_not_found", { callId: sid, httpStatus: fetchResult.httpStatus });
    stopCallV4CallerActivePoll();
    await applyCallerRemoteTerminal(sid, "failed_or_stale");
    return true;
  }

  const status = fetchResult.session?.status ?? null;
  if (!status) return false;

  if (status === "active") {
    logCallV4("caller_active_detected", { callId: sid });
    stopCallV4CallerActivePoll();
    useCallV4Store.getState().setPhase("joining");
    void import("@/lib/community-messenger/call-v4/call-v4-actions").then((mod) =>
      mod.callV4EnsureAgoraJoined(sid),
    );
    return true;
  }

  if (isCallerTerminalStatus(status)) {
    logCallV4("caller_terminal_detected", { callId: sid, status });
    stopCallV4CallerActivePoll();
    await applyCallerRemoteTerminal(sid, status);
    return true;
  }

  return false;
}

/** Outgoing caller: detect callee accept (active) or remote terminal (reject/cancel/end). */
export function startCallV4CallerActivePoll(callId: string): () => void {
  const sid = callId.trim();
  if (!sid) {
    return () => undefined;
  }
  if (isLegacyWebCallEstablishmentRemoved()) {
    logCallV4("legacy_web_establishment_removed", { callId: sid, source: "caller_poll" });
    return () => undefined;
  }

  stopCallV4CallerActivePoll();
  callerActivePollCallId = sid;

  let stopped = false;
  const onResult = async (fetchResult: CallV4CallerPollFetchResult) => {
    if (stopped || callerActivePollCallId !== sid) return;
    const phase = readCallV4Phase();
    const identity = readCallV4Identity();

    if (!isCallerPollOutgoingPhase(phase) || identity?.callId !== sid || identity.direction !== "outgoing") {
      return;
    }

    if (await isNativeEstablishmentOwned(sid)) {
      logCallV4("web_agora_establishment_quarantined", { callId: sid, source: "caller_poll" });
      stopCallV4CallerActivePoll();
      return;
    }
    if (stopped || callerActivePollCallId !== sid) return;

    logCallV4("caller_poll_status", {
      callId: sid,
      status: fetchResult.session?.status ?? null,
      phase,
    });

    await handleCallerPollFetchResult(sid, fetchResult);
  };

  const unsubscribe = subscribeCallV4SessionStatus(sid, onResult, {
    isWanted: () => {
      const identity = readCallV4Identity();
      return isCallerPollOutgoingPhase(readCallV4Phase()) && identity?.callId === sid && identity.direction === "outgoing";
    },
  });
  callerActivePollUnsubscribe = () => {
    stopped = true;
    unsubscribe();
  };

  return stopCallV4CallerActivePoll;
}

export function resetCallV4CallerActivePollForTests(): void {
  stopCallV4CallerActivePoll();
}
