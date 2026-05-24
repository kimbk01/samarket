/**
 * GET /api/me/profile — 짧은 성공 응답 메모리 캐시 (userId+mode 키, dev·prod 공통).
 * PATCH 등 프로필 변경 시 `clearMeProfileResponseCachesForUser` 로 무효화한다.
 */
import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";
import type { ProfileRow } from "@/lib/profile/types";

const TTL_MS = 15_000;

const cache = new Map<string, { profile: ProfileRow; storedAt: number }>();

function cacheKey(userId: string, mode: "full" | "lite"): string {
  return `${userId.trim()}\0${mode}`;
}

export type MeProfileResponseCachePeek =
  | { hit: true; profile: ProfileRow; storedAt: number; cache_key: string }
  | { hit: false; reason: "miss" | "ttl_expired"; cache_key: string };

/** miss 원인까지 분리 — `[dev-api-perf]` `profile_response_cache_bypass_reason` 용 */
export function peekMeProfileGetResponseCacheDetailed(
  userId: string,
  mode: "full" | "lite"
): MeProfileResponseCachePeek {
  const cache_key = cacheKey(userId, mode);
  const row = cache.get(cache_key);
  const now = Date.now();
  if (!row) {
    logRouteCacheMiss("/api/me/profile", { cache_key, reason: "miss" });
    return { hit: false, reason: "miss", cache_key };
  }
  if (now - row.storedAt > TTL_MS) {
    cache.delete(cache_key);
    logRouteCacheMiss("/api/me/profile", { cache_key, reason: "ttl_expired" });
    return { hit: false, reason: "ttl_expired", cache_key };
  }
  logRouteCacheHit("/api/me/profile", {
    cache_key,
    cache_hit: 1,
    age_ms: now - row.storedAt,
    ttl_ms: TTL_MS,
  });
  return { hit: true, profile: row.profile, storedAt: row.storedAt, cache_key };
}

export function peekMeProfileGetResponseCache(
  userId: string,
  mode: "full" | "lite"
): { profile: ProfileRow; storedAt: number } | undefined {
  const d = peekMeProfileGetResponseCacheDetailed(userId, mode);
  return d.hit ? { profile: d.profile, storedAt: d.storedAt } : undefined;
}

export function setMeProfileGetResponseCache(userId: string, mode: "full" | "lite", profile: ProfileRow): void {
  const k = cacheKey(userId, mode);
  cache.set(k, { profile, storedAt: Date.now() });
}

export function clearMeProfileResponseCachesForUser(userId: string): void {
  const p = `${userId.trim()}\0`;
  for (const k of cache.keys()) {
    if (k.startsWith(p)) cache.delete(k);
  }
}

export const ME_PROFILE_RESPONSE_CACHE_TTL_MS = TTL_MS;
