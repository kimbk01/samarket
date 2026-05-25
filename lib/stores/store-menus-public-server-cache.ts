import { runSingleFlight, forgetSingleFlight } from "@/lib/http/run-single-flight";
import {
  logSnapshotSwrAnalysis,
  snapshotSwrBackgroundRefreshTimer,
  type SnapshotSwrRefreshReason,
} from "@/lib/stores/snapshot-swr-analysis";

const DEFAULT_SOFT_TTL_MS = 15_000;
const DEFAULT_HARD_TTL_MS = 60_000;
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

const cache = new Map<string, CacheRow>();
const revalidateInflight = new Map<string, Promise<void>>();

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
  const ageMs = Math.max(0, now - row.cachedAt);
  if (row.staleUntil <= now) {
    cache.delete(k);
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
  snapshotVia?: MenusCacheSnapshotVia
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
}

export function runStoreMenusPublicServerSingleFlight<T>(
  slug: string,
  factory: () => Promise<T>
): Promise<T> {
  return runSingleFlight(`store-menus-api:slug:${cacheKey(slug)}`, factory);
}

export function invalidateStoreMenusPublicServerCacheForSlug(slug: string): void {
  const k = cacheKey(slug);
  cache.delete(k);
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

/** soft stale — 응답 즉시, 백그라운드 snapshot row / RPC refresh */
export function scheduleStoreMenusRouteMemoryRevalidate(
  slug: string,
  fetcher: () => Promise<{ body: CachedMenusBody; snapshotVia?: MenusCacheSnapshotVia } | null>,
  refreshReason: SnapshotSwrRefreshReason = "soft_stale_expired"
): void {
  const k = cacheKey(slug);
  if (revalidateInflight.has(k)) return;

  logSnapshotSwrAnalysis({
    slug: k,
    background_refresh_started: true,
    refresh_reason: refreshReason,
    memory_hit: false,
    memory_soft_stale_hit: true,
    memory_hard_stale: false,
    background_refresh_finished: false,
    snapshot_lookup_skipped: true,
    served_stale: true,
    response_returned_before_refresh: true,
  });

  const timer = snapshotSwrBackgroundRefreshTimer();
  const flight = (async () => {
    try {
      const result = await fetcher();
      if (result) {
        writeStoreMenusPublicServerCache(k, result.body, result.snapshotVia);
      }
    } catch {
      /* keep stale snapshot */
    } finally {
      timer.finish(k);
    }
  })().finally(() => {
    if (revalidateInflight.get(k) === flight) revalidateInflight.delete(k);
  });

  revalidateInflight.set(k, flight);
  void flight.catch(() => {});
}

/** 테스트 */
export function resetStoreMenusPublicServerCacheForTests(): void {
  cache.clear();
  revalidateInflight.clear();
}
