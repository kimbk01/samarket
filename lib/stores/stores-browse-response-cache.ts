import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";

/**
 * GET /api/stores/browse - response cache (primary/sub/region/city/district/address/geo/page/limit)
 * CUT 3: addressId isolates browse response cache for same geo bucket.
 * CUT 4: Delivery browse origin for members = master only (profiles/GPS removed).
 */
const TTL_MS = 45_000;

const cache = new Map<string, { expiresAt: number; body: unknown }>();

export function browseListCacheKey(parts: {
  primary: string;
  sub: string;
  region: string;
  city: string;
  district: string;
  /** Member master address identity — `addr:{uuid}` | `addr:none` (CUT 3) */
  addressPart: string;
  geoPart: string;
  page: string;
  limit: string;
  sort: string;
  /** Accept-Language 기반 UI 언어 — 사전 번역 필드 혼선 방지 */
  uiLang: string;
  popularityWindowDays?: number;
}): string {
  return [
    parts.primary,
    parts.sub,
    parts.region,
    parts.city,
    parts.district,
    parts.addressPart || "addr:none",
    parts.geoPart,
    parts.page,
    parts.limit,
    parts.sort,
    parts.uiLang,
    String(parts.popularityWindowDays ?? 30),
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

/**
 * 5-C BR-02 — 탐색 선반 소스 매장 목록 캐시 (페이지 자연 목록 제외 전 · 소스 순서 · 중복 제거).
 * 키 = 응답 캐시와 같은 체계(페이지 1차·shelf 토큰·지역·주소·geo·언어·인기 기간·거리 정책·순위 기준) — `browseShelfSourceCacheKey`.
 * 선반 소스는 다른 1차일 수 있으므로 1차 단위 무효화에서도 **전체** 비운다 (`invalidateStoresBrowseMemoryCache`).
 * 인스턴스 공통 무효화는 `purgeAllStorePublicServerMemoryCaches` → `invalidateStoresBrowseMemoryCache()` 경유.
 */
const shelfSourceCache = new Map<string, { expiresAt: number; stores: unknown[] }>();

export function browseShelfSourceCacheKey(parts: {
  pagePrimary: string;
  shelfToken: string;
  region: string;
  city: string;
  district: string;
  addressPart: string;
  geoPart: string;
  uiLang: string;
  popularityWindowDays?: number;
  distancePolicyKey: string;
  rankingCriteriaKey: string;
}): string {
  return [
    "shelf",
    parts.pagePrimary,
    parts.shelfToken,
    parts.region,
    parts.city,
    parts.district,
    parts.addressPart || "addr:none",
    parts.geoPart,
    parts.uiLang,
    String(parts.popularityWindowDays ?? 30),
    parts.distancePolicyKey,
    parts.rankingCriteriaKey,
  ].join("\0");
}

export function peekStoresBrowseShelfSourceCache<T>(cacheKey: string): T[] | null {
  const row = shelfSourceCache.get(cacheKey);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    shelfSourceCache.delete(cacheKey);
    return null;
  }
  return row.stores as T[];
}

export function setStoresBrowseShelfSourceCache(cacheKey: string, stores: readonly unknown[]): void {
  shelfSourceCache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, stores: [...stores] });
  if (shelfSourceCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of shelfSourceCache) {
      if (v.expiresAt <= now) shelfSourceCache.delete(k);
    }
  }
}

/** Event-driven purge — optional primary prefix match on cache key segment 0. */
export function invalidateStoresBrowseMemoryCache(primarySlug?: string): void {
  shelfSourceCache.clear();
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
