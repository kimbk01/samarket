"use client";

import { callV3FetchSession } from "@/lib/community-messenger/call-v3/call-v3-api";
import { cleanupCallV3 } from "@/lib/community-messenger/call-v3/call-v3-cleanup";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { markCallV3IncomingDismissed } from "@/lib/community-messenger/call-v3/call-v3-incoming-dismiss";
import { exitCallV3ScreenAfterCleanup } from "@/lib/community-messenger/call-v3/call-v3-route";
import { stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";
import { readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";
import type { CallV3TerminalPhase } from "@/lib/community-messenger/call-v3/call-v3-types";

const CALLER_ACTIVE_POLL_MS = 1_000;

const CALLER_TERMINAL_STATUSES = new Set(["rejected", "cancelled", "canceled", "ended", "missed"]);

let callerActivePollTimer: ReturnType<typeof setInterval> | null = null;
let callerActivePollCallId: string | null = null;

export function stopCallV3CallerActivePoll(): void {
  if (callerActivePollTimer) {
    clearInterval(callerActivePollTimer);
    callerActivePollTimer = null;
  }
  callerActivePollCallId = null;
}

function isCallerTerminalStatus(status: string | null | undefined): boolean {
  return CALLER_TERMINAL_STATUSES.has((status ?? "").trim().toLowerCase());
}

function mapCallerTerminalStatus(status: string): CallV3TerminalPhase {
  const normalized = status.trim().toLowerCase();
  if (normalized === "rejected") return "rejected";
  if (normalized === "missed") return "missed";
  if (normalized === "ended") return "ended";
  return "cancelled";
}

async function applyCallerRemoteTerminal(callId: string, status: string): Promise<void> {
  const sid = callId.trim();
  if (!sid || readCallV3Identity()?.callId !== sid) return;

  logCallV3("remote_terminal_received", { callId: sid, status });
  stopCallV3Ringtone("remote_terminal");
  markCallV3IncomingDismissed(sid);
  await cleanupCallV3(sid, mapCallerTerminalStatus(status));
  exitCallV3ScreenAfterCleanup();
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
      if (phase !== "outgoing_ringing" || identity?.callId !== sid || identity.direction !== "outgoing") {
        return;
      }

      const session = await callV3FetchSession(sid);
      const status = session?.status ?? null;
      logCallV3("caller_poll_status", { callId: sid, status });
      if (!status) return;

      if (status === "active") {
        logCallV3("caller_active_detected", { callId: sid });
        stopCallV3CallerActivePoll();
        useCallV3Store.getState().setPhase("joining");
        return;
      }

      if (isCallerTerminalStatus(status)) {
        logCallV3("caller_terminal_detected", { callId: sid, status });
        stopCallV3CallerActivePoll();
        await applyCallerRemoteTerminal(sid, status);
      }
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
