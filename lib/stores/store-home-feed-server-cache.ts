import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export type StoreHomeFeedCachedPayload = {
  ok: true;
  stores: StoreHomeFeedItem[];
  meta: {
    source: "supabase";
    sorted_by: string;
    origin_source?: string;
    origin_address_id?: string | null;
  };
};

type Entry = { payload: StoreHomeFeedCachedPayload; expiresAt: number };

const storeHomeFeedServerCache = new Map<string, Entry>();

export const STORE_HOME_FEED_SERVER_CACHE_TTL_MS = 20_000;

function normalizeCoordForCache(value: number | null): string {
  return value == null ? "" : value.toFixed(5);
}

export function buildStoreHomeFeedCacheKey(input: {
  region: string | null;
  district: string | null;
  searchQ: string | null;
  userLat: number | null;
  userLng: number | null;
  originKey?: string | null;
  deliveryRideTimeSource?: "store" | "google";
  uiLang?: string;
  /** serviceability policy segment — must bust cache when Admin toggles range */
  distancePolicyKey?: string;
}): string {
  return [
    input.region ?? "",
    input.district ?? "",
    input.searchQ ?? "",
    input.originKey ?? "",
    normalizeCoordForCache(input.userLat),
    normalizeCoordForCache(input.userLng),
    input.deliveryRideTimeSource ?? "store",
    input.uiLang ?? "",
    input.distancePolicyKey ?? "off",
  ].join("|");
}

export function pruneExpiredStoreHomeFeedCache(): void {
  const now = Date.now();
  for (const [k, e] of storeHomeFeedServerCache) {
    if (e.expiresAt <= now) storeHomeFeedServerCache.delete(k);
  }
}

export function getStoreHomeFeedCache(key: string): StoreHomeFeedCachedPayload | null {
  pruneExpiredStoreHomeFeedCache();
  const e = storeHomeFeedServerCache.get(key);
  if (!e || e.expiresAt <= Date.now()) return null;
  return e.payload;
}

export function setStoreHomeFeedCache(key: string, payload: StoreHomeFeedCachedPayload): void {
  storeHomeFeedServerCache.set(key, {
    payload,
    expiresAt: Date.now() + STORE_HOME_FEED_SERVER_CACHE_TTL_MS,
  });
}

/**
 * 매장 위치·주소·공개 필드 PATCH 후 — 피드에 박힌 구 `stores` 좌표·matrix 결과가 남지 않게 전부 비운다.
 */
export function clearStoreHomeFeedServerCache(): void {
  storeHomeFeedServerCache.clear();
}
