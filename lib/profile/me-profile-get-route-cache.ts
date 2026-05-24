/**
 * GET /api/me/profile — 짧은 메모리 캐시 (TTL 15s, userId 키, dev·prod 공통).
 */
import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";
import type { ProfileRow } from "@/lib/profile/types";

const TTL_MS = 15_000;
const cache = new Map<string, { expiresAt: number; profile: ProfileRow | null }>();

export function peekMeProfileGetRouteCache(userId: string): ProfileRow | null | undefined {
  const k = userId.trim();
  if (!k) return undefined;
  const row = cache.get(k);
  const now = Date.now();
  if (!row || row.expiresAt <= now) {
    if (row) {
      cache.delete(k);
      logRouteCacheMiss("/api/me/profile", { cache_key: k, layer: "route_pipeline", reason: "expired" });
    }
    return undefined;
  }
  logRouteCacheHit("/api/me/profile", {
    cache_hit: 1,
    cache_key: k,
    layer: "route_pipeline",
    ttl_remaining_ms: row.expiresAt - now,
  });
  return row.profile;
}

export function setMeProfileGetRouteCache(userId: string, profile: ProfileRow | null): void {
  const k = userId.trim();
  if (!k) return;
  cache.set(k, { expiresAt: Date.now() + TTL_MS, profile });
}

export function clearMeProfileGetRouteCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  cache.delete(k);
}

export const ME_PROFILE_GET_ROUTE_CACHE_TTL_MS = TTL_MS;
