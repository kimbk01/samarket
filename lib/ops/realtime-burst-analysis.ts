"use client";

/**
 * OPS1 realtime burst — dedupe, merge conflict, cross-tab desync under event flood.
 */
export type RealtimeBurstAnalysis = {
  event_count: number;
  applied_count: number;
  deduped_count: number;
  duplicate_event_detected: number;
  merge_conflict_count: number;
  stale_discard_count: number;
  max_desync_ms: number;
  unread_final?: number;
  badge_final?: number;
  pass: 0 | 1;
};

type BurstWindow = {
  event_count: number;
  applied_count: number;
  deduped_count: number;
  duplicate_event_detected: number;
  merge_conflict_count: number;
  stale_discard_count: number;
  max_desync_ms: number;
  unread_final?: number;
  badge_final?: number;
  window_started_at: number;
};

let window: BurstWindow | null = null;
const BURST_FLUSH_MS = 2_000;
const BURST_EVENT_THRESHOLD = 5;

function shouldLogBurst(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as typeof globalThis & { __SAMARKET_OPS1_MONITOR__?: boolean };
  if (g.__SAMARKET_OPS1_MONITOR__ === true) return true;
  return process.env.NEXT_PUBLIC_SAMARKET_OPS1_MONITOR === "1";
}

function ensureWindow(): BurstWindow {
  if (!window) {
    window = {
      event_count: 0,
      applied_count: 0,
      deduped_count: 0,
      duplicate_event_detected: 0,
      merge_conflict_count: 0,
      stale_discard_count: 0,
      max_desync_ms: 0,
      window_started_at: Date.now(),
    };
  }
  return window;
}

export type RealtimeBurstEventKind =
  | "event"
  | "applied"
  | "deduped"
  | "duplicate"
  | "merge_conflict"
  | "stale_discard"
  | "desync"
  | "unread_final"
  | "badge_final";

export function recordRealtimeBurstEvent(
  kind: RealtimeBurstEventKind,
  value?: number
): void {
  if (!shouldLogBurst()) return;
  const w = ensureWindow();
  switch (kind) {
    case "event":
      w.event_count += 1;
      break;
    case "applied":
      w.applied_count += 1;
      break;
    case "deduped":
      w.deduped_count += 1;
      break;
    case "duplicate":
      w.duplicate_event_detected += 1;
      break;
    case "merge_conflict":
      w.merge_conflict_count += 1;
      break;
    case "stale_discard":
      w.stale_discard_count += 1;
      break;
    case "desync":
      w.max_desync_ms = Math.max(w.max_desync_ms, value ?? 0);
      break;
    case "unread_final":
      w.unread_final = value;
      break;
    case "badge_final":
      w.badge_final = value;
      break;
    default:
      break;
  }
  const elapsed = Date.now() - w.window_started_at;
  if (w.event_count >= BURST_EVENT_THRESHOLD && elapsed >= BURST_FLUSH_MS) {
    flushRealtimeBurstAnalysis();
  }
}

function evaluateBurstPass(w: BurstWindow): 0 | 1 {
  if (w.duplicate_event_detected > 0 && w.merge_conflict_count > 0) return 0;
  if (w.max_desync_ms > 500) return 0;
  return 1;
}

export function flushRealtimeBurstAnalysis(): RealtimeBurstAnalysis | null {
  if (!shouldLogBurst() || !window) return null;
  const w = window;
  const analysis: RealtimeBurstAnalysis = {
    event_count: w.event_count,
    applied_count: w.applied_count,
    deduped_count: w.deduped_count,
    duplicate_event_detected: w.duplicate_event_detected,
    merge_conflict_count: w.merge_conflict_count,
    stale_discard_count: w.stale_discard_count,
    max_desync_ms: w.max_desync_ms,
    unread_final: w.unread_final,
    badge_final: w.badge_final,
    pass: evaluateBurstPass(w),
  };
  // eslint-disable-next-line no-console -- OPS1 required output
  console.log("[realtime-burst-analysis]", analysis);
  window = null;
  return analysis;
}

export function resetRealtimeBurstWindow(): void {
  window = null;
}
