/**
 * GET /api/me/stores/:id/order-counts 짧은 서버 캐시.
 * 매장 허브·비즈니스 페이지·주문 탭이 각각 폴링해도 동일 사용자/매장 조합은 TTL 안에서 DB를 한 번만 친다.
 */

import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import type { DeliverySummaryOrderCountsVia } from "@/lib/stores/delivery-summary-signoff-observability";
import { invalidateDeliverySummarySnapshotCache } from "@/lib/stores/delivery-summary-snapshot-cache";
import { scheduleOwnerStoreOrdersListSnapshotRefresh } from "@/lib/delivery/owner/owner-store-orders-list-snapshot-refresh";

export type StoreOrderCountsPayload = {
  ok: true;
} & OwnerStoreOpsSnapshot;

export type StoreOrderCountsFactoryResult = {
  payload: StoreOrderCountsPayload;
  /** Honest producer — do not hardcode delivery_summary_snapshot */
  via: DeliverySummaryOrderCountsVia;
};

/** 허브·주문 탭 폴링 겹침 흡수 — 3~5초 권장 */
const ORDER_COUNTS_TTL_MS = 5_000;

const cache = new Map<
  string,
  { expiresAt: number; value: StoreOrderCountsPayload; via: DeliverySummaryOrderCountsVia }
>();
const flights = new Map<string, Promise<StoreOrderCountsFactoryResult>>();

/**
 * v4 W1 API-01: 캐시 키 = store + user. storeId 단독 키는 다른 사용자가 TTL 안에 같은 매장 지표를 받을 수 있었다.
 * 형식 `${storeId}::${userId}` — 매장 단위 무효화는 `${storeId}::` 접두로 일괄 삭제.
 */
function cacheKey(storeId: string, userId: string): string {
  const s = storeId.trim();
  const u = userId.trim();
  if (!s || !u) return "";
  return `${s}::${u}`;
}

function deleteStoreEntries(storeId: string): void {
  const s = storeId.trim();
  if (!s) return;
  const prefix = `${s}::`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export type InvalidateStoreOrderCountsOpts = {
  /** Default true. Mutation coalesce sets false and schedules list refresh once. */
  scheduleListRefresh?: boolean;
};

/** 주문·환불 상태 변경 직후 API에서 호출하면 다음 폴링 전에 정확한 배지를 줄 수 있음 */
export function invalidateStoreOrderCountsCache(
  storeId: string,
  ownerUserId?: string | null,
  opts?: InvalidateStoreOrderCountsOpts
): void {
  deleteStoreEntries(storeId);
  invalidateDeliverySummarySnapshotCache(storeId, ownerUserId ?? null);
  if (opts?.scheduleListRefresh === false) return;
  scheduleOwnerStoreOrdersListSnapshotRefresh(storeId, ownerUserId ?? null);
}

export function peekStoreOrderCountsInflight(storeId: string, userId: string): boolean {
  const key = cacheKey(storeId, userId);
  if (!key) return false;
  return flights.has(key);
}

export function peekStoreOrderCountsCacheHit(storeId: string, userId: string): boolean {
  const key = cacheKey(storeId, userId);
  if (!key) return false;
  const hit = cache.get(key);
  return !!hit && hit.expiresAt > Date.now();
}

/**
 * Cold miss 직후 — 이미 계산된 payload 를 TTL 캐시에 동기 반영(추가 RPC·single-flight 대기 없음).
 * warm 경로는 `getCachedStoreOrderCounts` peek hit 만 사용.
 */
export function primeStoreOrderCountsCache(
  storeId: string,
  userId: string,
  value: StoreOrderCountsPayload,
  via: DeliverySummaryOrderCountsVia = "delivery_summary_snapshot"
): void {
  const key = cacheKey(storeId, userId);
  if (!key) return;
  const now = Date.now();
  pruneExpired(now);
  cache.set(key, { value, via, expiresAt: now + ORDER_COUNTS_TTL_MS });
  flights.delete(key);
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
  via?: DeliverySummaryOrderCountsVia;
};

export async function getCachedStoreOrderCounts(
  storeId: string,
  userId: string,
  factory: () => Promise<StoreOrderCountsFactoryResult>
): Promise<CachedStoreOrderCountsResult> {
  const key = cacheKey(storeId, userId);
  if (!key) {
    const produced = await factory();
    return { payload: produced.payload, cache_hit: false, via: produced.via };
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { payload: hit.value, cache_hit: true, via: hit.via };
  }

  const existing = flights.get(key);
  if (existing) {
    const produced = await existing;
    return {
      payload: produced.payload,
      cache_hit: peekStoreOrderCountsCacheHit(storeId, userId),
      via: produced.via,
    };
  }

  pruneExpired(now);

  const flight = factory()
    .then((produced) => {
      cache.set(key, {
        value: produced.payload,
        via: produced.via,
        expiresAt: Date.now() + ORDER_COUNTS_TTL_MS,
      });
      return produced;
    })
    .finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });

  flights.set(key, flight);
  const produced = await flight;
  return { payload: produced.payload, cache_hit: false, via: produced.via };
}
