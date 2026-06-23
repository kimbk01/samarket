"use client";

import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import type { CallV3Router } from "@/lib/community-messenger/call-v3/call-v3-route";
import { readCallV3Identity, readCallV3Phase } from "@/lib/community-messenger/call-v3/call-v3-store";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { getMessengerCallSoundConfigCache } from "@/lib/community-messenger/messenger-call-sound-config-client";

type MissedTimerRole = "outgoing" | "incoming";

type MissedTimerMeta = {
  timerId: ReturnType<typeof setTimeout>;
  deadlineMs: number;
  role: MissedTimerRole;
};

const missedTimers = new Map<string, MissedTimerMeta>();

export function readCallV3MissedTimeoutMsForTests(): number {
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

export function clearCallV3MissedTimer(callId?: string): void {
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

function scheduleMissedTimer(input: {
  callId: string;
  role: MissedTimerRole;
  startedAt: string | undefined;
  router?: CallV3Router;
}): void {
  const sid = input.callId.trim();
  if (!sid) return;

  const { delayMs, deadlineMs } = computeMissedDelayMs(input.startedAt);
  const prev = missedTimers.get(sid);
  if (prev && prev.deadlineMs === deadlineMs && prev.role === input.role) return;
  if (prev) clearTimeout(prev.timerId);

  logCallV3("missed_timer_start", {
    callId: sid,
    role: input.role,
    delayMs,
    deadlineMs,
    timeoutMs: readCallV3MissedTimeoutMsForTests(),
  });

  const timerId = setTimeout(() => {
    missedTimers.delete(sid);
    logCallV3("missed_timer_fire", { callId: sid, role: input.role });
    void import("@/lib/community-messenger/call-v3/call-v3-actions").then((mod) =>
      mod.callV3HandleMissedTimeout(sid, `${input.role}:no_answer`, input.router)
    );
  }, delayMs);

  missedTimers.set(sid, { timerId, deadlineMs, role: input.role });
}

export function startCallV3OutgoingMissedTimer(
  callId: string,
  startedAt?: string,
  router?: CallV3Router
): void {
  const sid = callId.trim();
  if (!sid) return;

  const phase = readCallV3Phase();
  const identity = readCallV3Identity();
  if (identity?.callId !== sid || identity.direction !== "outgoing") return;
  if (phase !== "outgoing_ringing" && phase !== "creating") return;

  scheduleMissedTimer({
    callId: sid,
    role: "outgoing",
    startedAt: startedAt ?? identity.createdAt,
    router,
  });
}

export function startCallV3IncomingMissedTimer(callId: string, startedAt?: string): void {
  const sid = callId.trim();
  if (!sid) return;

  const phase = readCallV3Phase();
  const identity = readCallV3Identity();
  if (identity?.callId !== sid || identity.direction !== "incoming") return;
  if (phase !== "incoming_ringing") return;

  scheduleMissedTimer({
    callId: sid,
    role: "incoming",
    startedAt: startedAt ?? identity.createdAt,
  });
}

export function readCallV3MissedTimerCallIdForTests(): string | null {
  const first = missedTimers.keys().next();
  return first.done ? null : first.value;
}

export function resetCallV3MissedTimersForTests(): void {
  clearCallV3MissedTimer();
}
