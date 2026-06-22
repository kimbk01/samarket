"use client";

/** FCM/native wake ↔ Web incoming GET/presenter 상관 — logcat·콘솔 grep 용 */
type IncomingTraceMark = {
  callId: string;
  at: number;
  source: "fcm_wake" | "native_push" | "realtime_insert" | "poll_hit";
};

let lastNativeWake: IncomingTraceMark | null = null;
let lastPollHit: IncomingTraceMark | null = null;

export function markIncomingCallNativeWake(
  callId: string,
  source: IncomingTraceMark["source"] = "fcm_wake"
): void {
  const id = callId.trim();
  if (!id) return;
  lastNativeWake = { callId: id, at: Date.now(), source };
  console.info("[call-flow] incoming_native_wake_mark", { callId: id, source, at: lastNativeWake.at });
}

export function markIncomingCallPollHit(callId: string, count: number): void {
  const id = callId.trim();
  if (!id) return;
  lastPollHit = { callId: id, at: Date.now(), source: "poll_hit" };
  const wake = lastNativeWake;
  const wakeMatched = wake?.callId === id;
  console.info("[call-flow] incoming_poll_correlation", {
    callId: id,
    pollCount: count,
    nativeWakeMatched: wakeMatched,
    nativeWakeAgeMs: wakeMatched && wake ? Date.now() - wake.at : null,
    nativeWakeSource: wake?.source ?? null,
  });
}

export function readIncomingCallTraceCorrelation(callId: string): {
  nativeWakeMatched: boolean;
  nativeWakeAgeMs: number | null;
  pollHitAgeMs: number | null;
} {
  const id = callId.trim();
  const wake = lastNativeWake?.callId === id ? lastNativeWake : null;
  const poll = lastPollHit?.callId === id ? lastPollHit : null;
  const now = Date.now();
  return {
    nativeWakeMatched: wake != null,
    nativeWakeAgeMs: wake ? now - wake.at : null,
    pollHitAgeMs: poll ? now - poll.at : null,
  };
}

export function hasRecentIncomingCallNativeWake(maxAgeMs = 90_000): boolean {
  if (!lastNativeWake) return false;
  return Date.now() - lastNativeWake.at <= maxAgeMs;
}

export function resetIncomingCallTraceBridgeForTests(): void {
  lastNativeWake = null;
  lastPollHit = null;
}
