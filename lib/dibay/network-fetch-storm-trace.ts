/**
 * DIBAY network/fetch storm audit — dev-only fetch·polling·reconnect·rerender 추적.
 * Production hot path 에는 no-op.
 */

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

const fetchCountsByApi = new Map<string, number[]>();
const WINDOW_MS = 60_000;

function pruneWindow(now: number, bucket: number[]): number[] {
  const cutoff = now - WINDOW_MS;
  let i = 0;
  while (i < bucket.length && bucket[i]! < cutoff) i += 1;
  return i > 0 ? bucket.slice(i) : bucket;
}

function recordFetch(api: string, now = Date.now()): number {
  const key = api.trim() || "(unknown)";
  const prev = fetchCountsByApi.get(key) ?? [];
  const next = pruneWindow(now, prev);
  next.push(now);
  fetchCountsByApi.set(key, next);
  return next.length;
}

const renderCountsByComponent = new Map<string, number>();

export function logFetchTrace(args: {
  api: string;
  component: string;
  reason: string;
  renderCount?: number;
}): void {
  if (!isDev) return;
  const request_count_60s = recordFetch(args.api);
  console.debug("[fetch-trace]", {
    api: args.api,
    component: args.component,
    reason: args.reason,
    renderCount: args.renderCount ?? null,
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    request_count_60s,
    ts: Date.now(),
  });
}

export function logPollingTrace(args: {
  api: string;
  intervalMs: number;
  createdAt: number;
  cleanup: boolean;
  caller?: string;
}): void {
  if (!isDev) return;
  console.debug("[polling-trace]", {
    api: args.api,
    intervalMs: args.intervalMs,
    createdAt: args.createdAt,
    cleanup: args.cleanup,
    caller: args.caller ?? null,
    ts: Date.now(),
  });
}

export function logRtReconnectTrace(args: {
  roomId?: string | null;
  reconnectReason: string;
  attempt: number;
  channelName?: string;
}): void {
  if (!isDev) return;
  console.debug("[rt-reconnect]", {
    roomId: args.roomId ?? null,
    channelName: args.channelName ?? null,
    reconnectReason: args.reconnectReason,
    attempt: args.attempt,
    visibility: typeof document !== "undefined" ? document.visibilityState : "unknown",
    ts: Date.now(),
  });
}

export function bumpRerenderTrace(component: string, changedKeys?: string[]): number {
  if (!isDev) return 0;
  const next = (renderCountsByComponent.get(component) ?? 0) + 1;
  renderCountsByComponent.set(component, next);
  console.debug("[rerender-trace]", {
    component,
    renderCount: next,
    changedKeys: changedKeys ?? [],
    ts: Date.now(),
  });
  return next;
}

export function getFetchTraceCount60s(api: string): number {
  const key = api.trim() || "(unknown)";
  const bucket = fetchCountsByApi.get(key) ?? [];
  return pruneWindow(Date.now(), bucket).length;
}

export function resetFetchStormTraceForTests(): void {
  fetchCountsByApi.clear();
  renderCountsByComponent.clear();
}
