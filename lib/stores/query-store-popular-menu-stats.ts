import type { SupabaseClient } from "@supabase/supabase-js";

export type StorePopularMenuStatRow = {
  product_id: string;
  total_qty: number;
  last_ordered_at: string;
};

/**
 * 최근 `windowDays`일 completed/paid 주문 기준 인기 상품 집계.
 * DB RPC `get_store_popular_product_stats` (마이그레이션) — 실패 시 빈 배열.
 */
export async function queryStorePopularMenuStats(
  sb: SupabaseClient,
  storeId: string,
  windowDays: number,
  topN: number
): Promise<StorePopularMenuStatRow[]> {
  const sid = storeId.trim();
  if (!sid) return [];
  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const n = Math.max(1, Math.min(50, Math.floor(topN)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await sb.rpc("get_store_popular_product_stats", {
    p_store_id: sid,
    p_since: since,
    p_limit: n,
  });

  if (error) {
    if (!String(error.message || "").includes("get_store_popular_product_stats")) {
      console.error("[queryStorePopularMenuStats]", error.message);
    }
    return [];
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((r: Record<string, unknown>) => ({
      product_id: String(r.product_id ?? ""),
      total_qty: Number(r.total_qty) || 0,
      last_ordered_at: String(r.last_ordered_at ?? ""),
    }))
    .filter((r) => r.product_id.length > 0);
}
