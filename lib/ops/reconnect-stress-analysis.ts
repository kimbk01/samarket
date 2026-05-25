"use client";

/**
 * OPS1 reconnect stress — duplicate subscribe, silent refresh, unread/badge stability.
 */
export type ReconnectStressAnalysis = {
  room_id: string;
  reconnect_count: number;
  duplicate_subscribe_count: number;
  stale_event_discarded: number;
  silent_refresh_count: number;
  legacy_fallback_used: 0 | 1;
  unread_before?: number;
  unread_after?: number;
  badge_before?: number;
  badge_after?: number;
  desync_ms?: number;
  pass: 0 | 1;
};

type ReconnectStressAccumulator = {
  room_id: string;
  reconnect_count: number;
  duplicate_subscribe_count: number;
  stale_event_discarded: number;
  silent_refresh_count: number;
  legacy_fallback_used: 0 | 1;
  unread_before?: number;
  unread_after?: number;
  badge_before?: number;
  badge_after?: number;
  desync_ms?: number;
  last_flush_at: number;
};

const accumulators = new Map<string, ReconnectStressAccumulator>();

function shouldLogReconnectStress(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as typeof globalThis & { __SAMARKET_OPS1_MONITOR__?: boolean };
  if (g.__SAMARKET_OPS1_MONITOR__ === true) return true;
  return process.env.NEXT_PUBLIC_SAMARKET_OPS1_MONITOR === "1";
}

function getOrCreate(roomId: string): ReconnectStressAccumulator {
  const key = roomId.trim() || "home";
  let row = accumulators.get(key);
  if (!row) {
    row = {
      room_id: key,
      reconnect_count: 0,
      duplicate_subscribe_count: 0,
      stale_event_discarded: 0,
      silent_refresh_count: 0,
      legacy_fallback_used: 0,
      last_flush_at: Date.now(),
    };
    accumulators.set(key, row);
  }
  return row;
}

export function recordReconnectStressEvent(
  roomId: string,
  event:
    | "reconnect"
    | "duplicate_subscribe"
    | "stale_discard"
    | "silent_refresh"
    | "legacy_fallback"
    | "unread_snapshot"
    | "badge_snapshot"
    | "desync"
    ,
  value?: number
): void {
  if (!shouldLogReconnectStress()) return;
  const row = getOrCreate(roomId);
  switch (event) {
    case "reconnect":
      row.reconnect_count += 1;
      break;
    case "duplicate_subscribe":
      row.duplicate_subscribe_count += 1;
      break;
    case "stale_discard":
      row.stale_event_discarded += 1;
      break;
    case "silent_refresh":
      row.silent_refresh_count += 1;
      break;
    case "legacy_fallback":
      row.legacy_fallback_used = 1;
      break;
    case "unread_snapshot":
      if (row.unread_before == null) row.unread_before = value ?? 0;
      else row.unread_after = value ?? row.unread_after;
      break;
    case "badge_snapshot":
      if (row.badge_before == null) row.badge_before = value ?? 0;
      else row.badge_after = value ?? row.badge_after;
      break;
    case "desync":
      row.desync_ms = Math.max(row.desync_ms ?? 0, value ?? 0);
      break;
    default:
      break;
  }
}

function evaluatePass(row: ReconnectStressAccumulator): 0 | 1 {
  if (row.duplicate_subscribe_count > 0) return 0;
  if (row.legacy_fallback_used === 1) return 0;
  if (row.silent_refresh_count > 1) return 0;
  if (
    row.unread_before != null &&
    row.unread_after != null &&
    row.unread_after > row.unread_before
  ) {
    return 0;
  }
  return 1;
}

export function flushReconnectStressAnalysis(roomId: string): ReconnectStressAnalysis | null {
  if (!shouldLogReconnectStress()) return null;
  const key = roomId.trim() || "home";
  const row = accumulators.get(key);
  if (!row) return null;
  const analysis: ReconnectStressAnalysis = {
    room_id: row.room_id,
    reconnect_count: row.reconnect_count,
    duplicate_subscribe_count: row.duplicate_subscribe_count,
    stale_event_discarded: row.stale_event_discarded,
    silent_refresh_count: row.silent_refresh_count,
    legacy_fallback_used: row.legacy_fallback_used,
    unread_before: row.unread_before,
    unread_after: row.unread_after,
    badge_before: row.badge_before,
    badge_after: row.badge_after,
    desync_ms: row.desync_ms,
    pass: evaluatePass(row),
  };
  // eslint-disable-next-line no-console -- OPS1 required output
  console.log("[reconnect-stress-analysis]", analysis);
  row.last_flush_at = Date.now();
  return analysis;
}

export function resetReconnectStressAccumulator(roomId?: string): void {
  if (roomId?.trim()) accumulators.delete(roomId.trim());
  else accumulators.clear();
}
