/**
 * `/stores/owner` 허브 첫 진입 waterfall — `[owner-dashboard-waterfall]` (관측·스케줄만).
 */
import type { OwnerDashboardApiName, OwnerDashboardApiPriority } from "@/lib/business/owner-dashboard-api-priority";
import { ownerDashboardApiFirstPaintBlocking } from "@/lib/business/owner-dashboard-api-priority";
import { isClientProdPerfLogEnabled } from "@/lib/performance/prod-same-region-perf";

export type OwnerDashboardWaterfallLog = {
  page_mount_ts: number;
  first_shell_paint_ms: number | null;
  critical_start_ms: number | null;
  critical_done_ms: number | null;
  deferred_start_ms: number | null;
  background_start_ms: number | null;
  api_name: OwnerDashboardApiName | string;
  api_start_ms: number | null;
  api_done_ms: number | null;
  api_duration_ms: number | null;
  first_paint_blocking: boolean;
  priority: OwnerDashboardApiPriority;
  cold_or_warm: "cold" | "warm" | "unknown";
  cache_hit: 0 | 1 | null;
  actual_handler_ms: number | null;
  event?: string;
};

const g = globalThis as typeof globalThis & {
  __samOwnerDashboardWaterfall?: {
    pageMountPerf: number;
    firstShellPaintMs: number | null;
    criticalStartMs: number | null;
    criticalDoneMs: number | null;
    deferredStartMs: number | null;
    backgroundStartMs: number | null;
    activeApis: Map<
      string,
      { name: OwnerDashboardApiName | string; startMs: number; priority: OwnerDashboardApiPriority }
    >;
  };
};

function state() {
  if (!g.__samOwnerDashboardWaterfall) {
    g.__samOwnerDashboardWaterfall = {
      pageMountPerf: typeof performance !== "undefined" ? performance.now() : 0,
      firstShellPaintMs: null,
      criticalStartMs: null,
      criticalDoneMs: null,
      deferredStartMs: null,
      backgroundStartMs: null,
      activeApis: new Map(),
    };
  }
  return g.__samOwnerDashboardWaterfall;
}

function sinceMountMs(): number {
  const s = state();
  return Math.round((typeof performance !== "undefined" ? performance.now() : 0) - s.pageMountPerf);
}

function logWaterfall(row: Partial<OwnerDashboardWaterfallLog> & { api_name: string }): void {
  if (!isClientProdPerfLogEnabled()) return;
  const s = state();
  const payload: OwnerDashboardWaterfallLog = {
    page_mount_ts: 0,
    first_shell_paint_ms: s.firstShellPaintMs,
    critical_start_ms: s.criticalStartMs,
    critical_done_ms: s.criticalDoneMs,
    deferred_start_ms: s.deferredStartMs,
    background_start_ms: s.backgroundStartMs,
    api_start_ms: row.api_start_ms ?? null,
    api_done_ms: row.api_done_ms ?? null,
    api_duration_ms: row.api_duration_ms ?? null,
    first_paint_blocking: row.first_paint_blocking ?? false,
    priority: row.priority ?? "background",
    cold_or_warm: row.cold_or_warm ?? "unknown",
    cache_hit: row.cache_hit ?? null,
    actual_handler_ms: row.actual_handler_ms ?? null,
    ...row,
    api_name: row.api_name,
  };
  // eslint-disable-next-line no-console -- owner dashboard waterfall trace
  console.info(`[owner-dashboard-waterfall] ${JSON.stringify(payload)}`);
}

export function resetOwnerDashboardWaterfallForHubVisit(): void {
  g.__samOwnerDashboardWaterfall = undefined;
}

export function enterOwnerDashboardWaterfallPage(): void {
  resetOwnerDashboardWaterfallForHubVisit();
  state();
  logWaterfall({
    api_name: "page",
    event: "page_mount",
    priority: "critical",
    first_paint_blocking: false,
    cold_or_warm: "cold",
    api_start_ms: 0,
    api_done_ms: 0,
    api_duration_ms: 0,
  });
}

export function markOwnerDashboardFirstShellPaint(): void {
  const s = state();
  if (s.firstShellPaintMs != null) return;
  s.firstShellPaintMs = sinceMountMs();
  logWaterfall({
    api_name: "shell",
    event: "first_shell_paint",
    priority: "critical",
    first_paint_blocking: false,
    cold_or_warm: "cold",
    api_start_ms: s.firstShellPaintMs,
    api_done_ms: s.firstShellPaintMs,
    api_duration_ms: 0,
  });
}

export function markOwnerDashboardCriticalStart(): void {
  const s = state();
  if (s.criticalStartMs == null) s.criticalStartMs = sinceMountMs();
}

export function markOwnerDashboardCriticalDone(): void {
  const s = state();
  if (s.criticalDoneMs == null) s.criticalDoneMs = sinceMountMs();
}

export function markOwnerDashboardDeferredStart(): void {
  const s = state();
  if (s.deferredStartMs == null) s.deferredStartMs = sinceMountMs();
}

export function markOwnerDashboardBackgroundStart(): void {
  const s = state();
  if (s.backgroundStartMs == null) s.backgroundStartMs = sinceMountMs();
}

export function trackOwnerDashboardApiStart(
  apiName: OwnerDashboardApiName,
  opts?: { priority?: OwnerDashboardApiPriority; cache_hit?: 0 | 1 }
): void {
  const priority = opts?.priority ?? "deferred";
  if (priority === "critical") markOwnerDashboardCriticalStart();
  if (priority === "deferred") markOwnerDashboardDeferredStart();
  if (priority === "background") markOwnerDashboardBackgroundStart();

  const startMs = sinceMountMs();
  state().activeApis.set(apiName, { name: apiName, startMs, priority });
  logWaterfall({
    api_name: apiName,
    event: "api_start",
    priority,
    first_paint_blocking: ownerDashboardApiFirstPaintBlocking(apiName),
    cold_or_warm: opts?.cache_hit === 1 ? "warm" : "cold",
    cache_hit: opts?.cache_hit ?? null,
    api_start_ms: startMs,
    api_done_ms: null,
    api_duration_ms: null,
  });
}

export function trackOwnerDashboardApiDone(
  apiName: OwnerDashboardApiName,
  opts?: {
    priority?: OwnerDashboardApiPriority;
    cache_hit?: 0 | 1;
    actual_handler_ms?: number;
    client_duration_ms?: number;
  }
): void {
  const s = state();
  const active = s.activeApis.get(apiName);
  const doneMs = sinceMountMs();
  const startMs = active?.startMs ?? doneMs;
  const duration = Math.max(0, doneMs - startMs);
  s.activeApis.delete(apiName);

  const priority = opts?.priority ?? active?.priority ?? "deferred";
  if (priority === "critical") markOwnerDashboardCriticalDone();

  logWaterfall({
    api_name: apiName,
    event: "api_done",
    priority,
    first_paint_blocking: ownerDashboardApiFirstPaintBlocking(apiName),
    cold_or_warm: opts?.cache_hit === 1 ? "warm" : "cold",
    cache_hit: opts?.cache_hit ?? null,
    api_start_ms: startMs,
    api_done_ms: doneMs,
    api_duration_ms: opts?.client_duration_ms ?? duration,
    actual_handler_ms: opts?.actual_handler_ms ?? null,
  });
}

/** 첫 shell paint 이후 실행 — critical 도 paint 후 스케줄(서버 cold RPC 가 shell 을 막지 않게). */
export function scheduleOwnerDashboardAfterFirstPaint(
  run: () => void | Promise<void>,
  opts?: { background?: boolean }
): void {
  if (typeof window === "undefined") {
    void run();
    return;
  }
  const exec = () => {
    markOwnerDashboardFirstShellPaint();
    void Promise.resolve().then(() => run());
  };
  const ric = window.requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (opts?.background && ric) {
    ric(exec, { timeout: 8_000 });
    return;
  }
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.setTimeout(exec, 0);
    });
  });
}
