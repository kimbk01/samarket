/**
 * heartbeat_timeout terminal — ended_at authority.
 *
 * Stale end fires ≥ CALL_SERVER_HEARTBEAT_STALE_MS after the last sign of life, so
 * ended_at = now() inflates duration by minutes. The last observed presence is the
 * best server-side evidence of when the call actually stopped:
 *
 *   ended_at = clamp(max(caller_last_heartbeat_at, callee_last_heartbeat_at),
 *                    lower = connected_at ?? answered_at, upper = now)
 *
 * No valid heartbeat → now (legacy behaviour).
 */

function parseMs(value: string | null | undefined): number | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function resolveHeartbeatTimeoutEndedAtIso(input: {
  callerLastHeartbeatAt: string | null | undefined;
  calleeLastHeartbeatAt: string | null | undefined;
  answeredAt: string | null | undefined;
  connectedAt?: string | null | undefined;
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const beats = [parseMs(input.callerLastHeartbeatAt), parseMs(input.calleeLastHeartbeatAt)].filter(
    (v): v is number => v != null,
  );
  if (beats.length === 0) return new Date(nowMs).toISOString();
  let endedMs = Math.max(...beats);
  const lowerMs = parseMs(input.connectedAt) ?? parseMs(input.answeredAt);
  if (lowerMs != null && endedMs < lowerMs) endedMs = lowerMs;
  if (endedMs > nowMs) endedMs = nowMs;
  return new Date(endedMs).toISOString();
}
