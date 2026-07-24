import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetSingleFlight, getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { logRouteCacheHit, logRouteCacheMiss } from "@/lib/http/route-cache-log";
import {
  buildDomainBadgeAuthorityHttpPayload,
  type DomainBadgeAuthorityHttpPayload,
} from "@/lib/notifications/pipeline/build-domain-badge-authority-http";

/** hub(12s)·surface unread(20s) 사이 — badge-count 서버 단기 캐시 */
export const NOTIFICATION_BADGE_SERVER_CACHE_MS = 15_000;

type BadgeCacheEntry = { value: DomainBadgeAuthorityHttpPayload; expiresAt: number };

type NotificationBadgeServerCacheGlobal = {
  __samarketDomainBadgeAuthorityServerCache?: Map<string, BadgeCacheEntry>;
};

function badgeCacheMap(): Map<string, BadgeCacheEntry> {
  const g = globalThis as NotificationBadgeServerCacheGlobal;
  if (!g.__samarketDomainBadgeAuthorityServerCache) {
    g.__samarketDomainBadgeAuthorityServerCache = new Map();
  }
  return g.__samarketDomainBadgeAuthorityServerCache;
}

export function notificationBadgeRouteCacheKey(userId: string): string {
  return `notification-badge-count:${userId.trim()}`;
}

function badgeFlightKey(userId: string): string {
  return notificationBadgeRouteCacheKey(userId);
}

export function peekNotificationBadgeInflight(userId: string): boolean {
  const k = userId.trim();
  if (!k) return false;
  return getSingleFlightPromise(badgeFlightKey(k)) !== undefined;
}

export function peekNotificationBadgeCacheHit(userId: string): boolean {
  const k = userId.trim();
  if (!k) return false;
  const row = badgeCacheMap().get(k);
  return !!(row && row.expiresAt > Date.now());
}

function pruneExpiredBadgeCache(now: number) {
  const cache = badgeCacheMap();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > 500) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
}

/**
 * Product badge-count — Domain projection authority.
 * DO NOT use events chat SUM as Bell total or App Icon.
 * Phase J3: events SUM helper removed — App Icon / push badge_count = projection.appIconTotal.
 */
export async function fetchDomainBadgeAuthorityPayload(
  sb: SupabaseClient<any>,
  userId: string,
  opts?: { force?: boolean }
): Promise<DomainBadgeAuthorityHttpPayload> {
  const uid = userId.trim();
  if (!uid) {
    return buildDomainBadgeAuthorityHttpPayload(sb, "");
  }

  if (opts?.force) {
    return loadDomainBadge(sb, uid);
  }

  const now = Date.now();
  const cached = badgeCacheMap().get(uid);
  if (cached && cached.expiresAt > now) {
    logRouteCacheHit("/api/me/notifications/badge-count", {
      cache_hit: 1,
      route_cache_key: badgeFlightKey(uid),
      user_id: uid,
      ttl_remaining_ms: cached.expiresAt - now,
    });
    return cached.value;
  }

  pruneExpiredBadgeCache(now);

  logRouteCacheMiss("/api/me/notifications/badge-count", {
    route_cache_key: badgeFlightKey(uid),
    user_id: uid,
  });

  return runSingleFlight(badgeFlightKey(uid), async () => {
    const again = badgeCacheMap().get(uid);
    if (again && again.expiresAt > Date.now()) {
      return again.value;
    }
    return loadDomainBadge(sb, uid);
  });
}

async function loadDomainBadge(
  sb: SupabaseClient<any>,
  uid: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  const value = await buildDomainBadgeAuthorityHttpPayload(sb, uid);
  badgeCacheMap().set(uid, {
    value,
    expiresAt: Date.now() + NOTIFICATION_BADGE_SERVER_CACHE_MS,
  });
  return value;
}

export function invalidateNotificationBadgeCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  badgeCacheMap().delete(k);
  forgetSingleFlight(badgeFlightKey(k));
}

export function resetNotificationBadgeCacheForTests(): void {
  badgeCacheMap().clear();
}
