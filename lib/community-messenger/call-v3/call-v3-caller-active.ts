"use client";

import { callV3FetchSession } from "@/lib/community-messenger/call-v3/call-v3-api";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

const CALLER_ACTIVE_POLL_MS = 1_500;

let callerActivePollTimer: ReturnType<typeof setInterval> | null = null;
let callerActivePollCallId: string | null = null;

export function stopCallV3CallerActivePoll(): void {
  if (callerActivePollTimer) {
    clearInterval(callerActivePollTimer);
    callerActivePollTimer = null;
  }
  callerActivePollCallId = null;
}

/** Outgoing caller: detect callee accept (session active) and move to joining. */
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
      if (session?.status === "active") {
        logCallV3("caller_active_detected", { callId: sid });
        stopCallV3CallerActivePoll();
        useCallV3Store.getState().setPhase("joining");
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
