import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";

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
  sort: string;
  /** Accept-Language 기반 UI 언어 — 사전 번역 필드 혼선 방지 */
  uiLang: string;
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
    parts.sort,
    parts.uiLang,
  ].join("\0");
}

export function peekStoresBrowseCache(cacheKey: string): unknown | null {
  const row = cache.get(cacheKey);
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    if (row) cache.delete(cacheKey);
    logRouteCacheMiss("/api/stores/browse", { cache_key: cacheKey, reason: row ? "ttl_expired" : "miss" });
    return null;
  }
  logRouteCacheHit("/api/stores/browse", {
    cache_hit: 1,
    cache_key: cacheKey,
    ttl_remaining_ms: row.expiresAt - now,
  });
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

/** Event-driven purge — optional primary prefix match on cache key segment 0. */
export function invalidateStoresBrowseMemoryCache(primarySlug?: string): void {
  const prefix = primarySlug?.trim().toLowerCase();
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.split("\0")[0] === prefix) cache.delete(k);
  }
}

export const STORES_BROWSE_RESPONSE_CACHE_TTL_MS = TTL_MS;
