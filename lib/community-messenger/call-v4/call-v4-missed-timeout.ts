"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import type { CallV4Router } from "@/lib/community-messenger/call-v4/call-v4-route";
import { readCallV4Identity, readCallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-store";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { getMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";

type MissedTimerMeta = {
  timerId: ReturnType<typeof setTimeout>;
  deadlineMs: number;
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

function scheduleOutgoingMissedTimer(input: {
  callId: string;
  startedAt: string | undefined;
  router?: CallV4Router;
}): void {
  const sid = input.callId.trim();
  if (!sid) return;

  const { delayMs, deadlineMs } = computeMissedDelayMs(input.startedAt);
  const prev = missedTimers.get(sid);
  if (prev && prev.deadlineMs === deadlineMs) return;
  if (prev) clearTimeout(prev.timerId);

  logCallV4("missed_timer_start", {
    callId: sid,
    role: "outgoing",
    delayMs,
    deadlineMs,
    timeoutMs: readCallV4MissedTimeoutMsForTests(),
  });

  const timerId = setTimeout(() => {
    missedTimers.delete(sid);
    logCallV4("missed_timer_fire", { callId: sid, role: "outgoing" });
    void import("@/lib/community-messenger/call-v4/call-v4-actions").then((mod) =>
      mod.callV4HandleMissedTimeout(sid, "outgoing:no_answer", input.router),
    );
  }, delayMs);

  missedTimers.set(sid, { timerId, deadlineMs });
}

export function startCallV4OutgoingMissedTimer(
  callId: string,
  startedAt?: string,
  router?: CallV4Router,
): void {
  const sid = callId.trim();
  if (!sid) return;

  const phase = readCallV4Phase();
  const identity = readCallV4Identity();
  if (identity?.callId !== sid || identity.direction !== "outgoing") return;
  if (phase !== "outgoing_ringing" && phase !== "creating") return;

  scheduleOutgoingMissedTimer({
    callId: sid,
    startedAt: startedAt ?? identity.createdAt,
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
