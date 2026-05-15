/** GET /api/stores/browse - response cache (primary/sub/region/city/district/geo/page/limit) */
const TTL_MS = 45_000;

const cache = new Map<string, { expiresAt: number; body: unknown }>();

export function browseListCacheKey(parts: {
  primary: string;
  sub: string;
  region: string;
  city: string;
  district: string;
  geoPart: string;
  page: string;
  limit: string;
}): string {
  return [
    parts.primary,
    parts.sub,
    parts.region,
    parts.city,
    parts.district,
    parts.geoPart,
    parts.page,
    parts.limit,
  ].join("\0");
}

export function peekStoresBrowseCache(cacheKey: string): unknown | null {
  const row = cache.get(cacheKey);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(cacheKey);
    return null;
  }
  return row.body;
}

export function setStoresBrowseCache(cacheKey: string, body: unknown): void {
  cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, body });
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
}

export const STORES_BROWSE_RESPONSE_CACHE_TTL_MS = TTL_MS;
