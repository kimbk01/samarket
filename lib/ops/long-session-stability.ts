"use client";

/**
 * OPS1 long-session monitor — cache growth, duplicate subscriptions, stale state.
 */
export type LongSessionStability = {
  duration_min: number;
  route_changes: number;
  snapshot_refresh_count: number;
  cache_entries: number;
  duplicate_subscription_count: number;
  memory_growth_mb: number;
  stale_state_count: number;
  regression_alert_count: number;
  pass: 0 | 1;
};

type LongSessionState = {
  started_at: number;
  route_changes: number;
  snapshot_refresh_count: number;
  cache_entries_peak: number;
  duplicate_subscription_count: number;
  baseline_heap_mb: number | null;
  stale_state_count: number;
  regression_alert_count: number;
  last_flush_at: number;
};

let state: LongSessionState | null = null;
const FLUSH_INTERVAL_MS = 60_000;

function shouldMonitorLongSession(): boolean {
  if (typeof window === "undefined") return false;
  const g = globalThis as typeof globalThis & { __SAMARKET_OPS1_MONITOR__?: boolean };
  if (g.__SAMARKET_OPS1_MONITOR__ === true) return true;
  return process.env.NEXT_PUBLIC_SAMARKET_OPS1_MONITOR === "1";
}

function heapMb(): number | null {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
  if (!perf.memory?.usedJSHeapSize) return null;
  return Math.round(perf.memory.usedJSHeapSize / (1024 * 1024));
}

function ensureState(): LongSessionState {
  if (!state) {
    state = {
      started_at: Date.now(),
      route_changes: 0,
      snapshot_refresh_count: 0,
      cache_entries_peak: 0,
      duplicate_subscription_count: 0,
      baseline_heap_mb: heapMb(),
      stale_state_count: 0,
      regression_alert_count: 0,
      last_flush_at: Date.now(),
    };
  }
  return state;
}

export function initLongSessionStabilityMonitor(): void {
  if (!shouldMonitorLongSession()) return;
  ensureState();
}

export function recordLongSessionEvent(
  kind:
    | "route_change"
    | "snapshot_refresh"
    | "cache_entries"
    | "duplicate_subscription"
    | "stale_state"
    | "regression_alert"
): void {
  if (!shouldMonitorLongSession()) return;
  const s = ensureState();
  switch (kind) {
    case "route_change":
      s.route_changes += 1;
      break;
    case "snapshot_refresh":
      s.snapshot_refresh_count += 1;
      break;
    case "cache_entries":
      break;
    case "duplicate_subscription":
      s.duplicate_subscription_count += 1;
      break;
    case "stale_state":
      s.stale_state_count += 1;
      break;
    case "regression_alert":
      s.regression_alert_count += 1;
      break;
    default:
      break;
  }
  if (kind === "cache_entries") return;
  maybeFlushLongSessionStability(false);
}

export function noteLongSessionCacheEntries(count: number): void {
  if (!shouldMonitorLongSession()) return;
  const s = ensureState();
  s.cache_entries_peak = Math.max(s.cache_entries_peak, count);
  maybeFlushLongSessionStability(false);
}

function evaluateLongSessionPass(s: LongSessionState, memoryGrowthMb: number): 0 | 1 {
  if (s.duplicate_subscription_count > 0) return 0;
  if (s.stale_state_count > 0) return 0;
  if (s.regression_alert_count > 0) return 0;
  if (memoryGrowthMb > 150) return 0;
  return 1;
}

export function flushLongSessionStability(force = false): LongSessionStability | null {
  return maybeFlushLongSessionStability(force);
}

function maybeFlushLongSessionStability(force: boolean): LongSessionStability | null {
  if (!shouldMonitorLongSession() || !state) return null;
  const s = state;
  const now = Date.now();
  if (!force && now - s.last_flush_at < FLUSH_INTERVAL_MS) return null;
  const durationMin = Math.round((now - s.started_at) / 60_000);
  const currentHeap = heapMb();
  const memoryGrowthMb =
    s.baseline_heap_mb != null && currentHeap != null
      ? Math.max(0, currentHeap - s.baseline_heap_mb)
      : 0;
  const row: LongSessionStability = {
    duration_min: durationMin,
    route_changes: s.route_changes,
    snapshot_refresh_count: s.snapshot_refresh_count,
    cache_entries: s.cache_entries_peak,
    duplicate_subscription_count: s.duplicate_subscription_count,
    memory_growth_mb: memoryGrowthMb,
    stale_state_count: s.stale_state_count,
    regression_alert_count: s.regression_alert_count,
    pass: evaluateLongSessionPass(s, memoryGrowthMb),
  };
  // eslint-disable-next-line no-console -- OPS1 required output
  console.log("[long-session-stability]", row);
  s.last_flush_at = now;
  return row;
}
