import { createHash } from "node:crypto";
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
/**
 * 묶음4 F-05 — 저장 주소 회원(사용자별 키)까지 캐시하므로 인스턴스당 항목 상한을 둔다.
 * 상한 도달 시 만료 항목부터, 그래도 넘치면 가장 오래 넣은 항목부터 지운다.
 */
export const STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES = 500;

/**
 * 묶음4 F-05 — 배달 거리 정책 전체(전역 정책 + 매장별 override)의 버전 키.
 * 관리자가 반경·정책·매장 override 중 무엇을 바꿔도 키가 바뀌어 이전 판정 결과를 재사용하지 않는다.
 */
export function buildStoreHomeFeedServiceabilityPolicyKey(ctx: {
  policy: { enabled: boolean } & Record<string, unknown>;
  overrides?: unknown;
}): string {
  if (!ctx.policy.enabled) return "off";
  const digest = createHash("sha1")
    .update(JSON.stringify({ policy: ctx.policy, overrides: ctx.overrides ?? null }))
    .digest("hex")
    .slice(0, 16);
  return `on:${digest}`;
}

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
  /** Distinct popular_menu overlay windows that affect HOME composition */
  popularityWindowDaysKey?: string;
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
    input.popularityWindowDaysKey ?? "30",
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
  if (!storeHomeFeedServerCache.has(key) && storeHomeFeedServerCache.size >= STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES) {
    pruneExpiredStoreHomeFeedCache();
    while (storeHomeFeedServerCache.size >= STORE_HOME_FEED_SERVER_CACHE_MAX_ENTRIES) {
      const oldest = storeHomeFeedServerCache.keys().next().value;
      if (oldest === undefined) break;
      storeHomeFeedServerCache.delete(oldest);
    }
  }
  storeHomeFeedServerCache.delete(key);
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
