/**
 * GET /api/me/profile 최종 `profile` 행 TTL 캐시 (prod·dev 공통).
 * PATCH 등 변경 시 `clearProfileResponseCacheForUser` 로 무효화.
 */
import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";
import type { ProfileRow } from "@/lib/profile/types";

const TTL_MS = 15_000;

const cache = new Map<string, { profile: ProfileRow; storedAt: number }>();

function key(userId: string, mode: "full" | "lite"): string {
  return `${userId.trim()}\0${mode}`;
}

export type ProfileResponseCachePeek =
  | { hit: true; profile: ProfileRow; storedAt: number; cache_key: string }
  | { hit: false; reason: "miss" | "ttl_expired"; cache_key: string };

export function peekProfileResponseCache(userId: string, mode: "full" | "lite"): ProfileResponseCachePeek {
  const cache_key = key(userId, mode);
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

export function setProfileResponseCache(userId: string, mode: "full" | "lite", profile: ProfileRow): void {
  cache.set(key(userId, mode), { profile, storedAt: Date.now() });
}

export function clearProfileResponseCacheForUser(userId: string): void {
  const p = `${userId.trim()}\0`;
  for (const k of cache.keys()) {
    if (k.startsWith(p)) cache.delete(k);
  }
}

export const PROFILE_RESPONSE_CACHE_TTL_MS = TTL_MS;
