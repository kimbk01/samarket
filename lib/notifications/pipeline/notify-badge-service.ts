import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetSingleFlight, getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { logRouteCacheMiss } from "@/lib/http/route-cache-log";
import {
  buildDomainBadgeAuthorityHttpPayload,
  type DomainBadgeAuthorityHttpPayload,
} from "@/lib/notifications/pipeline/build-domain-badge-authority-http";

/**
 * Historical TTL constant — kept for callers/tests.
 * Delivery LOCK (2026-08-01 Samsung Trace): do **not** serve in-process TTL hits.
 * Vercel multi-instance + local Domain writes left Boot non-fresh on stale appIcon
 * (Projection commit 22 while Domain/fresh=1 already 23) → NativeBadgeSync correctly
 * absolute-set Cap to that stale commit until TTL ≈ resume.
 * Concurrent identical loads still coalesce via single-flight only.
 */
export const NOTIFICATION_BADGE_SERVER_CACHE_MS = 0;

type NotificationBadgeServerCacheGlobal = {
  /** @deprecated Delivery LOCK — map retained only so invalidate/reset stay no-op-safe. */
  __samarketDomainBadgeAuthorityServerCache?: Map<string, unknown>;
};

function badgeCacheMap(): Map<string, unknown> {
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

/** Always false — TTL serve path removed (Delivery absolute Projection). */
export function peekNotificationBadgeCacheHit(_userId: string): boolean {
  return false;
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

  logRouteCacheMiss("/api/me/notifications/badge-count", {
    route_cache_key: badgeFlightKey(uid),
    user_id: uid,
    delivery_no_ttl_serve: 1,
  });

  return runSingleFlight(badgeFlightKey(uid), () => loadDomainBadge(sb, uid));
}

async function loadDomainBadge(
  sb: SupabaseClient<any>,
  uid: string
): Promise<DomainBadgeAuthorityHttpPayload> {
  return buildDomainBadgeAuthorityHttpPayload(sb, uid);
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
