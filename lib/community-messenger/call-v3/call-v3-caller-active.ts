"use client";

import {
  callV3FetchSessionForCallerPoll,
  type CallV3CallerPollFetchResult,
} from "@/lib/community-messenger/call-v3/call-v3-api";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { markCallV3IncomingDismissed } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { exitCallV3ScreenAfterCleanup, readCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import { stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CallV3Phase, CallV3TerminalPhase } from "@/lib/community-messenger/call-v3/call-v3-types";

const CALLER_ACTIVE_POLL_MS = 1_000;
/** Missed-call policy aligned — normal ringing must not be cut early. */
const CALLER_STALE_OUTGOING_MS = 45_000;

const CALLER_POLL_OUTGOING_PHASES = new Set<CallV3Phase>(["creating", "outgoing_ringing"]);

const CALLER_TERMINAL_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "ended",
  "missed",
  "failed",
]);

let callerActivePollTimer: ReturnType<typeof setInterval> | null = null;
let callerActivePollCallId: string | null = null;

export function stopCallV3CallerActivePoll(): void {
  if (callerActivePollTimer) {
    clearInterval(callerActivePollTimer);
    callerActivePollTimer = null;
  }
  callerActivePollCallId = null;
}

function readCallerPollRoute(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.pathname;
}

function isCallerPollOutgoingPhase(phase: CallV3Phase): boolean {
  return CALLER_POLL_OUTGOING_PHASES.has(phase);
}

function isCallerTerminalStatus(status: string | null | undefined): boolean {
  return CALLER_TERMINAL_STATUSES.has((status ?? "").trim().toLowerCase());
}

function logCallerPollStatus(input: {
  callId: string;
  status: string | null;
  phase: CallV3Phase;
  route: string | null;
  skipped?: boolean;
}): void {
  logCallV3("caller_poll_status", {
    callId: input.callId,
    status: input.status,
    phase: input.phase,
    route: input.route,
    ...(input.skipped ? { skipped: true } : {}),
  });
}

function readOutgoingCallAgeMs(createdAt: string | undefined): number {
  const startedMs = Date.parse(createdAt ?? "");
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, Date.now() - startedMs);
}

function mapCallerTerminalStatus(status: string): CallV3TerminalPhase {
  const normalized = status.trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  if (normalized === "failed" || normalized === "failed_or_stale") return "failed";
  return "cancelled";
}

async function applyCallerRemoteTerminal(callId: string, status: string): Promise<void> {
  const sid = callId.trim();
  if (!sid || readCallV3Identity()?.callId !== sid) return;

  logCallV3("remote_terminal_received", { callId: sid, status });
  stopCallV3Ringtone("remote_terminal");
  stopCallV3CallerActivePoll();
  markCallV3IncomingDismissed(sid);
  await cleanupCallV3(sid, mapCallerTerminalStatus(status));
  exitCallV3ScreenAfterCleanup(readCallV3ExitRouter() ?? undefined);
}

async function handleCallerPollFetchResult(callId: string, fetchResult: CallV3CallerPollFetchResult): Promise<boolean> {
  const sid = callId.trim();
  if (!sid) return true;

  if (fetchResult.notFound) {
    logCallV3("caller_poll_session_not_found", { callId: sid, httpStatus: fetchResult.httpStatus });
    stopCallV3CallerActivePoll();
    await applyCallerRemoteTerminal(sid, "failed_or_stale");
    return true;
  }

  const status = fetchResult.session?.status ?? null;
  if (!status) return false;

  if (status === "active") {
    logCallV3("caller_active_detected", { callId: sid });
    stopCallV3CallerActivePoll();
    useCallV3Store.getState().setPhase("joining");
    return true;
  }

  if (isCallerTerminalStatus(status)) {
    logCallV3("caller_terminal_detected", { callId: sid, status });
    stopCallV3CallerActivePoll();
    await applyCallerRemoteTerminal(sid, status);
    return true;
  }

  return false;
}

/** Outgoing caller: detect callee accept (active) or remote terminal (reject/cancel/end). */
export function startCallV3CallerActivePoll(callId: string): () => void {
  const sid = callId.trim();
  if (!sid) {
    return () => undefined;
  }

  stopCallV3CallerActivePoll();
  callerActivePollCallId = sid;

  const tick = () => {
    void (async () => {
      const phase = readCallV3Phase();
      const identity = readCallV3Identity();
      const route = readCallerPollRoute();

      if (!isCallerPollOutgoingPhase(phase) || identity?.callId !== sid || identity.direction !== "outgoing") {
        logCallerPollStatus({ callId: sid, status: null, phase, route, skipped: true });
        return;
      }

      const ageMs = readOutgoingCallAgeMs(identity.createdAt);
      if (ageMs > CALLER_STALE_OUTGOING_MS) {
        logCallV3("caller_poll_stale_timeout", { callId: sid, ageMs, phase, route });
        stopCallV3CallerActivePoll();
        await applyCallerRemoteTerminal(sid, "failed_or_stale");
        return;
      }

      const fetchResult = await callV3FetchSessionForCallerPoll(sid);
      logCallerPollStatus({
        callId: sid,
        status: fetchResult.session?.status ?? null,
        phase,
        route,
      });

      await handleCallerPollFetchResult(sid, fetchResult);
    })();
  };

  callerActivePollTimer = setInterval(tick, CALLER_ACTIVE_POLL_MS);
  void tick();

  return stopCallV3CallerActivePoll;
}

export function readCallV3CallerActivePollCallIdForTests(): string | null {
  return callerActivePollCallId;
}

export function resetCallV3CallerActivePollForTests(): void {
  stopCallV3CallerActivePoll();
}

export function readCallV3CallerStaleOutgoingMsForTests(): number {
  return CALLER_STALE_OUTGOING_MS;
}
