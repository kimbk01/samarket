import { invalidateOwnerDashboardNotificationsSnapshotCache } from "@/lib/notifications/owner-dashboard-notifications-snapshot-cache";
import type { BadgeTargetSurface } from "@/lib/notifications/badge-target-policy";
import { isTier1BellBadgeSurface } from "@/lib/notifications/resolve-tier1-bell-surface";

export type UnreadCountMode =
  | "all"
  | "consumer"
  | "consumer_no_chat"
  | "owner_store_commerce"
  | "bottom_nav"
  | "bottom_nav_no_chat";

/** 허브·배지 폴링 겹침 — 프로세스 단일 캐시락(globalThis) */
const TTL_MS = 20_000;

type CacheEntry = { value: number; expiresAt: number };

type NotificationUnreadCacheGlobal = {
  __samarketNotificationUnreadCache?: Map<string, CacheEntry>;
  __samarketNotificationUnreadFlights?: Map<string, Promise<number>>;
};

function cacheMap(): Map<string, CacheEntry> {
  const g = globalThis as NotificationUnreadCacheGlobal;
  if (!g.__samarketNotificationUnreadCache) {
    g.__samarketNotificationUnreadCache = new Map();
  }
  return g.__samarketNotificationUnreadCache;
}

function flightMap(): Map<string, Promise<number>> {
  const g = globalThis as NotificationUnreadCacheGlobal;
  if (!g.__samarketNotificationUnreadFlights) {
    g.__samarketNotificationUnreadFlights = new Map();
  }
  return g.__samarketNotificationUnreadFlights;
}

function makeKey(userId: string, mode: UnreadCountMode): string {
  return `${userId.trim()}::${mode}`;
}

function makeSurfaceKey(userId: string, surface: BadgeTargetSurface, storeId?: string | null): string {
  const sid = storeId?.trim() || "";
  return `${userId.trim()}::surface::${surface}::${sid}`;
}

function prune(now: number) {
  const cache = cacheMap();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > 200) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
}

export function invalidateNotificationUnreadCountCache(userId: string, storeId?: string | null): void {
  const uid = userId.trim();
  if (!uid) return;
  const cache = cacheMap();
  const flights = flightMap();
  for (const key of cache.keys()) {
    if (key.startsWith(`${uid}::`)) {
      cache.delete(key);
    }
  }
  for (const key of flights.keys()) {
    if (key.startsWith(`${uid}::`)) {
      flights.delete(key);
    }
  }
  invalidateOwnerDashboardNotificationsSnapshotCache(uid, storeId ?? null);
}

export function peekNotificationUnreadCountCacheHit(userId: string, mode: UnreadCountMode): boolean {
  const key = makeKey(userId, mode);
  const cached = cacheMap().get(key);
  return !!(cached && cached.expiresAt > Date.now());
}

export function peekNotificationUnreadCountInflight(userId: string, mode: UnreadCountMode): boolean {
  const key = makeKey(userId, mode);
  return flightMap().has(key);
}

export type CachedNotificationUnreadCountResult = {
  value: number;
  cache_hit: boolean;
  singleflight_hit: boolean;
};

export function getCachedNotificationUnreadCount(
  userId: string,
  mode: UnreadCountMode,
  factory: () => Promise<number>
): Promise<CachedNotificationUnreadCountResult> {
  const uid = userId.trim();
  if (!uid) {
    return factory().then((value) => ({
      value: Math.max(0, Math.floor(Number(value) || 0)),
      cache_hit: false,
      singleflight_hit: false,
    }));
  }

  const key = makeKey(uid, mode);
  const now = Date.now();
  const cache = cacheMap();
  const flights = flightMap();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve({
      value: cached.value,
      cache_hit: true,
      singleflight_hit: false,
    });
  }

  const existingFlight = flights.get(key);
  if (existingFlight) {
    return existingFlight.then((value) => ({
      value,
      cache_hit: peekNotificationUnreadCountCacheHit(uid, mode),
      singleflight_hit: true,
    }));
  }

  prune(now);

  const flight = factory()
    .then((value) => {
      const next = Math.max(0, Math.floor(Number(value) || 0));
      cache.set(key, { value: next, expiresAt: Date.now() + TTL_MS });
      return next;
    })
    .finally(() => {
      if (flights.get(key) === flight) {
        flights.delete(key);
      }
    });

  flights.set(key, flight);
  return flight.then((value) => ({
    value,
    cache_hit: false,
    singleflight_hit: false,
  }));
}

export function getCachedNotificationUnreadCountBySurface(
  userId: string,
  surface: BadgeTargetSurface,
  storeId: string | null | undefined,
  factory: () => Promise<number>
): Promise<CachedNotificationUnreadCountResult> {
  const uid = userId.trim();
  if (!uid) {
    return factory().then((value) => ({
      value: Math.max(0, Math.floor(Number(value) || 0)),
      cache_hit: false,
      singleflight_hit: false,
    }));
  }

  const key = makeSurfaceKey(uid, surface, storeId);
  const now = Date.now();
  const cache = cacheMap();
  const flights = flightMap();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve({
      value: cached.value,
      cache_hit: true,
      singleflight_hit: false,
    });
  }

  const existingFlight = flights.get(key);
  if (existingFlight) {
    return existingFlight.then((value) => ({
      value,
      cache_hit: cached != null && cached.expiresAt > now,
      singleflight_hit: true,
    }));
  }

  prune(now);

  const flight = factory()
    .then((value) => {
      const next = Math.max(0, Math.floor(Number(value) || 0));
      cache.set(key, { value: next, expiresAt: Date.now() + TTL_MS });
      return next;
    })
    .finally(() => {
      if (flights.get(key) === flight) {
        flights.delete(key);
      }
    });

  flights.set(key, flight);
  return flight.then((value) => ({
    value,
    cache_hit: false,
    singleflight_hit: false,
  }));
}

export function isBadgeSurfaceQueryParam(v: string | null | undefined): v is BadgeTargetSurface {
  if (!v?.trim()) return false;
  return isTier1BellBadgeSurface(v.trim()) || v.trim() === "all";
}
