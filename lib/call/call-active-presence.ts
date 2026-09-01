/**
 * DIBAY Call Active Presence SSOT (HEARTBEAT_SEMANTICS = B).
 *
 * Server caller/callee_last_heartbeat_at is WebView-JS PATCH only — not media
 * connectivity. One-sided HB stale MUST NOT end a session when the other peer
 * is fresh (2026-09-01 production regression).
 *
 * reconcile stale-active end and heartbeat cleanup MUST both consume this helper.
 */

import {
  CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS,
  CALL_SERVER_HEARTBEAT_STALE_MS,
} from "@/lib/call/call-server-heartbeat";

export const CALL_ACTIVE_PRESENCE_FRESH_MS = CALL_SERVER_HEARTBEAT_STALE_MS;

export type ActiveCallPresence = "LIVE" | "STALE" | "UNKNOWN";

export type ActiveCallPresenceRow = {
  status?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  caller_last_heartbeat_at?: string | null;
  callee_last_heartbeat_at?: string | null;
};

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toMs(value: string | null | undefined): number | null {
  const raw = trimText(value ?? "");
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function isFreshHb(hbMs: number | null, nowMs: number, freshMs: number): boolean {
  if (hbMs == null) return false;
  return nowMs - hbMs <= freshMs;
}

/**
 * Canonical presence for an answered active session.
 *
 * LIVE — at least one peer HB within freshness window
 * STALE — both HBs seeded and both outside freshness (after answer grace)
 * UNKNOWN — not active/answered, missing seed, or ambiguous — never treat as dead
 */
export function evaluateActiveCallPresence(
  row: ActiveCallPresenceRow,
  nowMs: number = Date.now(),
  freshMs: number = CALL_ACTIVE_PRESENCE_FRESH_MS,
): ActiveCallPresence {
  if (trimText(row.status) !== "active") return "UNKNOWN";
  if (trimText(row.ended_at ?? "")) return "UNKNOWN";

  const answeredMs = toMs(row.answered_at);
  if (answeredMs == null) return "UNKNOWN";

  const callerMs = toMs(row.caller_last_heartbeat_at);
  const calleeMs = toMs(row.callee_last_heartbeat_at);

  const callerFresh = isFreshHb(callerMs, nowMs, freshMs);
  const calleeFresh = isFreshHb(calleeMs, nowMs, freshMs);
  if (callerFresh || calleeFresh) return "LIVE";

  if (callerMs == null || calleeMs == null) return "UNKNOWN";

  if (nowMs - answeredMs < CALL_SERVER_HEARTBEAT_GRACE_AFTER_ANSWER_MS) {
    return "UNKNOWN";
  }

  return "STALE";
}

/** True only when Presence SSOT says STALE — shared by reconcile + cleanup. */
export function canEndActiveCallForPresenceStale(
  row: ActiveCallPresenceRow,
  nowMs: number = Date.now(),
): boolean {
  return evaluateActiveCallPresence(row, nowMs) === "STALE";
}
