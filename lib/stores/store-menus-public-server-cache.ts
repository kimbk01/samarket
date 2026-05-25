import { runSingleFlight, forgetSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 45_000;

type CachedMenusBody = Record<string, unknown>;

type MenusCacheSnapshotVia = "counter_row" | "unified_rpc";

type CacheRow = {
  expiresAt: number;
  body: CachedMenusBody;
  snapshotVia?: MenusCacheSnapshotVia;
};

const cache = new Map<string, CacheRow>();

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function readStoreMenusPublicServerCache(
  slug: string
): { body: CachedMenusBody; snapshotVia?: MenusCacheSnapshotVia } | null {
  const k = cacheKey(slug);
  const row = cache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(k);
    return null;
  }
  return { body: row.body, snapshotVia: row.snapshotVia };
}

export function writeStoreMenusPublicServerCache(
  slug: string,
  body: CachedMenusBody,
  snapshotVia?: MenusCacheSnapshotVia
): void {
  const k = cacheKey(slug);
  cache.set(k, { expiresAt: Date.now() + TTL_MS, body, snapshotVia });
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
}

/** 테스트 */
export function resetStoreMenusPublicServerCacheForTests(): void {
  cache.clear();
}
