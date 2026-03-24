import type { SupabaseClient } from "@supabase/supabase-js";

/** 매장별 `order_status = refund_requested` 건수 (목록 limit과 무관) */
export async function countRefundRequestedForStore(
  sb: SupabaseClient,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;

  const { count, error } = await sb
    .from("store_orders")
    .select("*", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "refund_requested");

  if (error) {
    console.error("[countRefundRequestedForStore]", error);
    return 0;
  }
  return count ?? 0;
}
