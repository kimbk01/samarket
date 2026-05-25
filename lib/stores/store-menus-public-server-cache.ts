import { runSingleFlight, forgetSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 45_000;

type CachedMenusBody = Record<string, unknown>;

const cache = new Map<string, { expiresAt: number; body: CachedMenusBody }>();

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function readStoreMenusPublicServerCache(slug: string): CachedMenusBody | null {
  const k = cacheKey(slug);
  const row = cache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(k);
    return null;
  }
  return row.body;
}

export function writeStoreMenusPublicServerCache(slug: string, body: CachedMenusBody): void {
  const k = cacheKey(slug);
  cache.set(k, { expiresAt: Date.now() + TTL_MS, body });
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
