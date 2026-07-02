"use client";

import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { readCallV4SessionIdFromNativeRoute } from "@/lib/community-messenger/call-v4/call-v4-native-route";
import {
  isCallV4OutgoingPresentationSource,
  type CallV4Router,
} from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { getMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";

export type CallV4OutgoingMissedTimerFireContext = {
  callId: string;
  direction: "outgoing";
  scheduledPhase: CallV4Phase;
};

type MissedTimerMeta = {
  timerId: ReturnType<typeof setTimeout>;
  deadlineMs: number;
  fireContext: CallV4OutgoingMissedTimerFireContext;
  router?: CallV4Router;
};

const missedTimers = new Map<string, MissedTimerMeta>();

export function readCallV4MissedTimeoutMsForTests(): number {
  return incomingRingTimeoutMsFromConfig(getMessengerCallSoundConfigCache());
}

function computeMissedDelayMs(startedAt: string | undefined): { delayMs: number; deadlineMs: number } {
  const timeoutMs = incomingRingTimeoutMsFromConfig(getMessengerCallSoundConfigCache());
  const startMs = Date.parse(startedAt ?? "");
  const now = Date.now();
  if (!Number.isFinite(startMs)) {
    return { delayMs: timeoutMs, deadlineMs: now + timeoutMs };
  }
  const deadlineMs = startMs + timeoutMs;
  return { delayMs: Math.max(0, deadlineMs - now), deadlineMs };
}

export function clearCallV4MissedTimer(callId?: string): void {
  if (!callId) {
    for (const meta of missedTimers.values()) {
      clearTimeout(meta.timerId);
    }
    missedTimers.clear();
    return;
  }
  const sid = callId.trim();
  const meta = missedTimers.get(sid);
  if (!meta) return;
  clearTimeout(meta.timerId);
  missedTimers.delete(sid);
}

function isOnOutgoingPresentationRoute(callId: string): boolean {
  if (typeof window === "undefined") return false;
  const sid = callId.trim();
  if (!sid) return false;
  const route = `${window.location.pathname}${window.location.search}`;
  if (readCallV4SessionIdFromNativeRoute(route) !== sid) return false;
  const source = new URLSearchParams(window.location.search).get("source");
  return isCallV4OutgoingPresentationSource(source);
}

function canScheduleOutgoingMissedTimer(callId: string): boolean {
  const sid = callId.trim();
  if (!sid) return false;

  const phase = readCallV4Phase();
  const identity = readCallV4Identity();
  if (identity?.callId !== sid || identity.direction !== "outgoing") return false;
  if (phase === "outgoing_ringing" || phase === "creating") return true;
  if (isLegacyWebCallEstablishmentRemoved() && isOnOutgoingPresentationRoute(sid) && phase === "joining") {
    return true;
  }
  return false;
}

function scheduleOutgoingMissedTimer(input: {
  callId: string;
  startedAt: string | undefined;
  scheduledPhase: CallV4Phase;
  router?: CallV4Router;
}): void {
  const sid = input.callId.trim();
  if (!sid) return;

  const { delayMs, deadlineMs } = computeMissedDelayMs(input.startedAt);
  const prev = missedTimers.get(sid);
  if (prev && prev.deadlineMs === deadlineMs) return;
  if (prev) clearTimeout(prev.timerId);

  const fireContext: CallV4OutgoingMissedTimerFireContext = {
    callId: sid,
    direction: "outgoing",
    scheduledPhase: input.scheduledPhase,
  };

  logCallV4("missed_timer_start", {
    callId: sid,
    role: "outgoing",
    delayMs,
    deadlineMs,
    timeoutMs: readCallV4MissedTimeoutMsForTests(),
    scheduledPhase: input.scheduledPhase,
  });

  const timerId = setTimeout(() => {
    missedTimers.delete(sid);
    logCallV4("missed_timer_fire", { callId: sid, role: "outgoing", scheduledPhase: input.scheduledPhase });
    void import("@/lib/community-messenger/call-v4/call-v4-actions")
      .then((mod) =>
        mod.callV4HandleMissedTimeout(sid, "outgoing:no_answer", input.router, fireContext),
      )
      .catch((error: unknown) => {
        logCallV4("missed_timer_handler_failed", {
          callId: sid,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, delayMs);

  missedTimers.set(sid, { timerId, deadlineMs, fireContext, router: input.router });
}

export function startCallV4OutgoingMissedTimer(
  callId: string,
  startedAt?: string,
  router?: CallV4Router,
): void {
  const sid = callId.trim();
  if (!sid) return;
  if (!canScheduleOutgoingMissedTimer(sid)) return;

  const identity = readCallV4Identity();
  scheduleOutgoingMissedTimer({
    callId: sid,
    startedAt: startedAt ?? identity?.createdAt,
    scheduledPhase: readCallV4Phase(),
    router,
  });
}

export function readCallV4MissedTimerCallIdForTests(): string | null {
  const first = missedTimers.keys().next();
  return first.done ? null : first.value;
}

export function resetCallV4MissedTimersForTests(): void {
  clearCallV4MissedTimer();
}
