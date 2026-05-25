import { runSingleFlight, forgetSingleFlight } from "@/lib/http/run-single-flight";
import {
  logSnapshotPreRefresh,
  snapshotPreRefreshTimer,
  type SnapshotPreRefreshSource,
} from "@/lib/stores/snapshot-pre-refresh";
import {
  logSnapshotSwrAnalysis,
  snapshotSwrBackgroundRefreshTimer,
  type SnapshotSwrRefreshReason,
} from "@/lib/stores/snapshot-swr-analysis";

const DEFAULT_SOFT_TTL_MS = 15_000;
const DEFAULT_HARD_TTL_MS = 60_000;
const DEFAULT_PRE_REFRESH_LEAD_MS = 10_000;
const CACHE_MAX_ENTRIES = 500;

type CachedMenusBody = Record<string, unknown>;

type MenusCacheSnapshotVia = "counter_row" | "unified_rpc";

type CacheRow = {
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
  body: CachedMenusBody;
  snapshotVia?: MenusCacheSnapshotVia;
};

export type StoreMenusPreRefreshFetcher = () => Promise<{
  body: CachedMenusBody;
  snapshotVia?: MenusCacheSnapshotVia;
} | null>;

type WriteOpts = {
  schedulePreRefreshTimer?: StoreMenusPreRefreshFetcher | null;
};

const cache = new Map<string, CacheRow>();
const revalidateInflight = new Map<string, Promise<void>>();
const preRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function storeMenusRouteMemorySoftTtlMs(): number {
  const raw = Number(process.env.STORE_MENUS_ROUTE_MEMORY_SOFT_TTL_MS ?? DEFAULT_SOFT_TTL_MS);
  if (!Number.isFinite(raw) || raw < 3_000) return DEFAULT_SOFT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(raw)));
}

export function storeMenusRouteMemoryHardTtlMs(): number {
  const raw = Number(process.env.STORE_MENUS_ROUTE_MEMORY_HARD_TTL_MS ?? DEFAULT_HARD_TTL_MS);
  if (!Number.isFinite(raw) || raw < 10_000) return DEFAULT_HARD_TTL_MS;
  return Math.min(120_000, Math.max(10_000, Math.floor(raw)));
}

export function storeMenusPreRefreshLeadMs(): number {
  const raw = Number(process.env.STORE_MENUS_PRE_REFRESH_LEAD_MS ?? DEFAULT_PRE_REFRESH_LEAD_MS);
  if (!Number.isFinite(raw) || raw < 2_000) return DEFAULT_PRE_REFRESH_LEAD_MS;
  return Math.min(30_000, Math.max(2_000, Math.floor(raw)));
}

function pruneExpired(now: number): void {
  for (const [key, row] of cache) {
    if (row.staleUntil <= now) cache.delete(key);
  }
  while (cache.size > CACHE_MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function cancelPreRefreshTimer(k: string): void {
  const timer = preRefreshTimers.get(k);
  if (timer) {
    clearTimeout(timer);
    preRefreshTimers.delete(k);
  }
}

function peekCacheRow(k: string): CacheRow | null {
  const row = cache.get(k);
  if (!row) return null;
  if (row.staleUntil <= Date.now()) return null;
  return row;
}

function remainingHardMs(row: CacheRow, now = Date.now()): number {
  return Math.max(0, row.staleUntil - now);
}

function staleAgeMs(row: CacheRow, now = Date.now()): number {
  return Math.max(0, now - row.cachedAt);
}

export type StoreMenusRouteMemoryRead =
  | { hit: false; reason: "miss" }
  | { hit: false; reason: "hard_stale"; ageMs: number }
  | {
      hit: true;
      body: CachedMenusBody;
      snapshotVia?: MenusCacheSnapshotVia;
      ageMs: number;
      stale: boolean;
    };

export function readStoreMenusPublicServerCache(slug: string): StoreMenusRouteMemoryRead {
  const k = cacheKey(slug);
  const now = Date.now();
  const row = cache.get(k);
  if (!row) {
    pruneExpired(now);
    return { hit: false, reason: "miss" };
  }
  const ageMs = staleAgeMs(row, now);
  if (row.staleUntil <= now) {
    cache.delete(k);
    cancelPreRefreshTimer(k);
    pruneExpired(now);
    return { hit: false, reason: "hard_stale", ageMs };
  }
  const stale = now >= row.freshUntil;
  return {
    hit: true,
    body: row.body,
    snapshotVia: row.snapshotVia,
    ageMs,
    stale,
  };
}

export function writeStoreMenusPublicServerCache(
  slug: string,
  body: CachedMenusBody,
  snapshotVia?: MenusCacheSnapshotVia,
  opts?: WriteOpts
): void {
  const k = cacheKey(slug);
  const now = Date.now();
  const softTtl = storeMenusRouteMemorySoftTtlMs();
  const hardTtl = Math.max(storeMenusRouteMemoryHardTtlMs(), softTtl);
  cache.set(k, {
    cachedAt: now,
    freshUntil: now + softTtl,
    staleUntil: now + hardTtl,
    body,
    snapshotVia,
  });
  pruneExpired(now);
  if (opts?.schedulePreRefreshTimer) {
    scheduleStoreMenusHardStalePreRefreshTimer(slug, opts.schedulePreRefreshTimer);
  }
}

export function runStoreMenusPublicServerSingleFlight<T>(
  slug: string,
  factory: () => Promise<T>
): Promise<T> {
  return runSingleFlight(`store-menus-api:slug:${cacheKey(slug)}`, factory);
}

/** hard stale 직전 proactive background refresh — 사용자 reopen 전 snapshot 갱신 */
export function scheduleStoreMenusHardStalePreRefreshTimer(
  slug: string,
  fetcher: StoreMenusPreRefreshFetcher
): void {
  const k = cacheKey(slug);
  cancelPreRefreshTimer(k);
  const row = peekCacheRow(k);
  if (!row) return;

  const leadMs = storeMenusPreRefreshLeadMs();
  const delay = Math.max(1, remainingHardMs(row) - leadMs);
  const timer = setTimeout(() => {
    preRefreshTimers.delete(k);
    const live = peekCacheRow(k);
    if (!live) return;
    if (remainingHardMs(live) > leadMs + 500) return;
    runStoreMenusRouteMemoryPreRefresh(k, fetcher, "proactive_timer");
  }, delay);
  preRefreshTimers.set(k, timer);
}

export function invalidateStoreMenusPublicServerCacheForSlug(slug: string): void {
  const k = cacheKey(slug);
  cache.delete(k);
  cancelPreRefreshTimer(k);
  forgetSingleFlight(`store-menus-api:slug:${k}`);
  forgetSingleFlight(`store-menus-swr:${k}`);
  logSnapshotSwrAnalysis({
    slug: k,
    refresh_reason: "mutation_invalidation",
    memory_hit: false,
    memory_soft_stale_hit: false,
    memory_hard_stale: false,
    background_refresh_started: false,
    background_refresh_finished: false,
    snapshot_lookup_skipped: false,
    served_stale: false,
    response_returned_before_refresh: false,
  });
}

function runStoreMenusRouteMemoryPreRefresh(
  slug: string,
  fetcher: StoreMenusPreRefreshFetcher,
  refreshSource: SnapshotPreRefreshSource
): void {
  const k = cacheKey(slug);
  const existing = revalidateInflight.get(k);
  if (existing) {
    logSnapshotPreRefresh({
      slug: k,
      refresh_inflight_join: true,
      refresh_source: refreshSource,
      pre_refresh_started: false,
      pre_refresh_finished: false,
      hard_stale_avoided: false,
      refresh_error: false,
    });
    return;
  }

  const beforeRow = peekCacheRow(k);
  const staleAgeBefore = beforeRow ? staleAgeMs(beforeRow) : null;
  const remainingBefore = beforeRow ? remainingHardMs(beforeRow) : null;
  const hardStaleAvoided =
    remainingBefore != null && remainingBefore <= storeMenusPreRefreshLeadMs() + 1_000;

  logSnapshotPreRefresh({
    slug: k,
    pre_refresh_started: true,
    pre_refresh_finished: false,
    refresh_source: refreshSource,
    stale_age_before_refresh: staleAgeBefore,
    hard_stale_avoided: hardStaleAvoided,
    refresh_inflight_join: false,
    refresh_error: false,
  });

  if (refreshSource === "soft_stale_request") {
    logSnapshotSwrAnalysis({
      slug: k,
      background_refresh_started: true,
      refresh_reason: "soft_stale_expired",
      memory_hit: false,
      memory_soft_stale_hit: true,
      memory_hard_stale: false,
      background_refresh_finished: false,
      snapshot_lookup_skipped: true,
      served_stale: true,
      response_returned_before_refresh: true,
    });
  }

  const swrTimer = refreshSource === "soft_stale_request" ? snapshotSwrBackgroundRefreshTimer() : null;
  const preTimer = snapshotPreRefreshTimer();

  const flight = (async () => {
    try {
      const result = await fetcher();
      if (result) {
        const hardTtl = Math.max(storeMenusRouteMemoryHardTtlMs(), storeMenusRouteMemorySoftTtlMs());
        writeStoreMenusPublicServerCache(k, result.body, result.snapshotVia, {
          schedulePreRefreshTimer: fetcher,
        });
        preTimer.finish(k, {
          pre_refresh_started: true,
          pre_refresh_extended_ttl: hardTtl,
          stale_age_before_refresh: staleAgeBefore,
          stale_age_after_refresh: 0,
          refresh_source: refreshSource,
          hard_stale_avoided: true,
          refresh_inflight_join: false,
          refresh_error: false,
        });
        swrTimer?.finish(k);
        return;
      }
      preTimer.finish(k, {
        pre_refresh_started: true,
        refresh_source: refreshSource,
        stale_age_before_refresh: staleAgeBefore,
        hard_stale_avoided: false,
        refresh_inflight_join: false,
        refresh_error: true,
      });
      swrTimer?.finish(k);
    } catch {
      preTimer.finish(k, {
        pre_refresh_started: true,
        refresh_source: refreshSource,
        stale_age_before_refresh: staleAgeBefore,
        hard_stale_avoided: false,
        refresh_inflight_join: false,
        refresh_error: true,
      });
      swrTimer?.finish(k);
    }
  })().finally(() => {
    if (revalidateInflight.get(k) === flight) revalidateInflight.delete(k);
  });

  revalidateInflight.set(k, flight);
  void flight.catch(() => {});
}

/** soft stale — 응답 즉시, 백그라운드 snapshot row / RPC refresh */
export function scheduleStoreMenusRouteMemoryRevalidate(
  slug: string,
  fetcher: StoreMenusPreRefreshFetcher,
  refreshReason: SnapshotSwrRefreshReason = "soft_stale_expired"
): void {
  void refreshReason;
  runStoreMenusRouteMemoryPreRefresh(slug, fetcher, "soft_stale_request");
}

/** 테스트 */
export function resetStoreMenusPublicServerCacheForTests(): void {
  for (const timer of preRefreshTimers.values()) clearTimeout(timer);
  preRefreshTimers.clear();
  cache.clear();
  revalidateInflight.clear();
}
