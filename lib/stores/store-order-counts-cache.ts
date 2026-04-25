/**
 * GET /api/me/stores/:id/order-counts 짧은 서버 캐시.
 * 매장 허브·비즈니스 페이지·주문 탭이 각각 폴링해도 동일 사용자/매장 조합은 TTL 안에서 DB를 한 번만 친다.
 */

export type StoreOrderCountsPayload = {
  ok: true;
  refund_requested_count: number;
  pending_accept_count: number;
  pending_delivery_count: number;
};

/** 비즈니스/주문 탭 폴링(25~30s)이 겹쳐도 한 차례 계산으로 흡수 */
const ORDER_COUNTS_TTL_MS = 28_000;

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

export async function getCachedStoreOrderCounts(
  storeId: string,
  factory: () => Promise<StoreOrderCountsPayload>
): Promise<StoreOrderCountsPayload> {
  const key = cacheKey(storeId);
  if (!key) {
    return factory();
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const existing = flights.get(key);
  if (existing) {
    return existing;
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
  return flight;
}
