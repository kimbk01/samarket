import { runSingleFlight } from "@/lib/http/run-single-flight";

const TTL_MS = 45_000;

type CachedSummaryBody = Record<string, unknown>;

const cache = new Map<string, { expiresAt: number; body: CachedSummaryBody }>();

function cacheKey(slug: string): string {
  return slug.trim().toLowerCase();
}

export function readStoreSummaryPublicServerCache(slug: string): CachedSummaryBody | null {
  const k = cacheKey(slug);
  const row = cache.get(k);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(k);
    return null;
  }
  return row.body;
}

export function writeStoreSummaryPublicServerCache(slug: string, body: CachedSummaryBody): void {
  const k = cacheKey(slug);
  cache.set(k, { expiresAt: Date.now() + TTL_MS, body });
}

export function runStoreSummaryPublicServerSingleFlight<T>(
  slug: string,
  factory: () => Promise<T>
): Promise<T> {
  return runSingleFlight(`store-summary-api:slug:${cacheKey(slug)}`, factory);
}

export function invalidateStoreSummaryPublicServerCache(slug: string): void {
  cache.delete(cacheKey(slug));
}

/** DEF-64 — 인스턴스 공통 세대 변경 시 이 인스턴스의 45s summary memory 전체 제거. */
export function clearStoreSummaryPublicServerCache(): void {
  cache.clear();
}

export function resetStoreSummaryPublicServerCacheForTests(): void {
  cache.clear();
}
