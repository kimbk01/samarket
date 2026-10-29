import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/**
 * v4 PERF-10 — 매장 「최근 90일 주문 수」(표시용 집계) 짧은 인스턴스 메모리 캐시.
 *
 * - 매장 상세(`/api/stores/[slug]`·summary 의 `loadStoreCommerceMeta`)·상품 상세가 같은 산식·같은 캐시를 쓴다.
 * - 값은 매장 단위(사용자 무관). 조회 오류는 저장하지 않는다(다음 요청 재시도).
 * - DEF-64 세대 purge(`purgeAllStorePublicServerMemoryCaches`)에 등록 — 관리자 변경 시 인스턴스 공통 비움.
 */
export const STORE_RECENT_ORDER_COUNT_CACHE_TTL_MS = 60_000;
export const STORE_RECENT_ORDER_WINDOW_DAYS = 90;

/** 90일 최근 주문 건수 집계 상태 — `/api/stores/[slug]` 와 동일 */
export const STORE_RECENT_ORDER_COUNT_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "refund_requested",
] as const;

const cache = new Map<string, { expiresAt: number; count: number }>();

/** 조회 실패 = null (호출자가 기존처럼 0 으로 표시) */
export async function loadStoreRecentOrderCount90dCached(
  sb: SupabaseClient,
  storeId: string
): Promise<number | null> {
  const id = String(storeId ?? "").trim();
  if (!id) return null;
  const hit = cache.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.count;
  return runSingleFlight(`store-recent-order-count-90d:${id}`, async () => {
    const again = cache.get(id);
    if (again && again.expiresAt > Date.now()) return again.count;
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - STORE_RECENT_ORDER_WINDOW_DAYS);
    const res = await sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", id)
      .in("order_status", [...STORE_RECENT_ORDER_COUNT_STATUSES])
      .gte("created_at", since.toISOString());
    if (res.error || typeof res.count !== "number") {
      if (res.error) console.error("[store-recent-order-count-90d]", res.error.message);
      return null;
    }
    cache.set(id, { expiresAt: Date.now() + STORE_RECENT_ORDER_COUNT_CACHE_TTL_MS, count: res.count });
    if (cache.size > 2_000) {
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    }
    return res.count;
  });
}

export function clearStoreRecentOrderCountCache(): void {
  cache.clear();
}
