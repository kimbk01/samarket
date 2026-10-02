"use client";

import {
  callV4FetchSessionForCallerPoll,
  type CallV4CallerPollFetchResult,
} from "@/lib/community-messenger/call-v4/call-v4-api";
import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { maybeExitCallV4ScreenAfterCleanup } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase, CallV4TerminalPhase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isNativeEstablishmentOwned } from "@/lib/call/native/native-outgoing-bridge";

const CALLER_ACTIVE_POLL_MS = 500;

const CALLER_POLL_OUTGOING_PHASES = new Set<CallV4Phase>(["creating", "outgoing_ringing"]);

const CALLER_TERMINAL_STATUSES = new Set([
  "rejected",
  "cancelled",
  "canceled",
  "ended",
  "missed",
  "failed",
]);

let callerActivePollTimer: ReturnType<typeof setTimeout> | null = null;
let callerActivePollCallId: string | null = null;
let callerActivePollInFlight = false;

export function stopCallV4CallerActivePoll(): void {
  if (callerActivePollTimer) {
    clearTimeout(callerActivePollTimer);
    callerActivePollTimer = null;
  }
  callerActivePollCallId = null;
  callerActivePollInFlight = false;
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

  // COST-01: setInterval → 단일 in-flight setTimeout 체인(겹침 방지) + 화면 보일 때만 폴링
  // + fetch 타임아웃(call-v4-api). 주기 값(500ms)은 그대로.
  const scheduleNext = () => {
    if (callerActivePollCallId !== sid) return;
    callerActivePollTimer = setTimeout(() => {
      callerActivePollTimer = null;
      void tick().finally(scheduleNext);
    }, CALLER_ACTIVE_POLL_MS);
  };

  const tick = async () => {
    if (callerActivePollCallId !== sid || callerActivePollInFlight) return;
    if (typeof document !== "undefined" && document.hidden) return;

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

    callerActivePollInFlight = true;
    try {
      const fetchResult = await callV4FetchSessionForCallerPoll(sid);
      logCallV4("caller_poll_status", {
        callId: sid,
        status: fetchResult.session?.status ?? null,
        phase,
      });
      await handleCallerPollFetchResult(sid, fetchResult);
    } catch {
      // COST-01: 타임아웃/네트워크 실패 — 다음 폴에서 재시도.
    } finally {
      callerActivePollInFlight = false;
    }
  };

  void tick().finally(scheduleNext);

  return stopCallV4CallerActivePoll;
}

export function resetCallV4CallerActivePollForTests(): void {
  stopCallV4CallerActivePoll();
}
