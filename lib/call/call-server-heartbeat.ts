/** Server-side active call heartbeat — stale timeout must exceed native FGS (35s). */

export const CALL_SERVER_HEARTBEAT_STALE_MS = 90_000;

/** After accept, wait before one-sided stale can fire */
export const CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS = 30_000;

export const CALL_SERVER_HEARTBEAT_ENDED_REASON = "heartbeat_timeout";

export type CallSessionHeartbeatRole = "caller" | "callee";

export type CallSessionHeartbeatRow = {
  id: string;
  initiator_user_id: string;
  recipient_user_id: string | null;
  answered_at: string | null;
  caller_last_heartbeat_at: string | null;
  callee_last_heartbeat_at: string | null;
};

/** One-sided stale: either peer silent > stale window after grace + both have heartbeated once */
export function isCallSessionOneSidedHeartbeatStale(
  row: CallSessionHeartbeatRow,
  nowMs: number = Date.now(),
): boolean {
  const callerHb = row.caller_last_heartbeat_at?.trim();
  const calleeHb = row.callee_last_heartbeat_at?.trim();
  if (!callerHb || !calleeHb) return false;

  const answeredAt = row.answered_at?.trim();
  if (!answeredAt) return false;
  const answeredMs = Date.parse(answeredAt);
  if (!Number.isFinite(answeredMs)) return false;
  if (nowMs - answeredMs < CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS) return false;

  const cutoffMs = nowMs - CALL_SERVER_HEARTBEAT_STALE_MS;
  const callerMs = Date.parse(callerHb);
  const calleeMs = Date.parse(calleeHb);
  if (!Number.isFinite(callerMs) || !Number.isFinite(calleeMs)) return false;

  return callerMs < cutoffMs || calleeMs < cutoffMs;
}
