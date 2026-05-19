/**
 * GET /api/me/stores/:id/order-counts 짧은 서버 캐시.
 * 매장 허브·비즈니스 페이지·주문 탭이 각각 폴링해도 동일 사용자/매장 조합은 TTL 안에서 DB를 한 번만 친다.
 */

import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";

export type StoreOrderCountsPayload = {
  ok: true;
} & OwnerStoreOpsSnapshot;

/** 허브·주문 탭 폴링 겹침 흡수 — 5~10초 권장 범위 */
const ORDER_COUNTS_TTL_MS = 8_000;

const cache = new Map<string, { expiresAt: number; value: StoreOrderCountsPayload }>();
const flights = new Map<string, Promise<StoreOrderCountsPayload>>();

function cacheKey(storeId: string): string {
  return storeId.trim();
}

/** 주문·환불 상태 변경 직후 API에서 호출하면 다음 폴링 전에 정확한 배지를 줄 수 있음 */
export function invalidateStoreOrderCountsCache(storeId: string): void {
  const k = cacheKey(storeId);
  if (k) cache.delete(k);
}

export function peekStoreOrderCountsCacheHit(storeId: string): boolean {
  const key = cacheKey(storeId);
  if (!key) return false;
  const hit = cache.get(key);
  return !!hit && hit.expiresAt > Date.now();
}

function pruneExpired(now: number) {
  for (const [k, e] of cache) {
    if (e.expiresAt <= now) cache.delete(k);
  }
  while (cache.size > 300) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
}

export type CachedStoreOrderCountsResult = {
  payload: StoreOrderCountsPayload;
  cache_hit: boolean;
};

export async function getCachedStoreOrderCounts(
  storeId: string,
  factory: () => Promise<StoreOrderCountsPayload>
): Promise<CachedStoreOrderCountsResult> {
  const key = cacheKey(storeId);
  if (!key) {
    return { payload: await factory(), cache_hit: false };
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { payload: hit.value, cache_hit: true };
  }

  const existing = flights.get(key);
  if (existing) {
    const payload = await existing;
    return { payload, cache_hit: peekStoreOrderCountsCacheHit(storeId) };
  }

  pruneExpired(now);

  const flight = factory()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ORDER_COUNTS_TTL_MS });
      return value;
    })
    .finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });

  flights.set(key, flight);
  const payload = await flight;
  return { payload, cache_hit: false };
}
