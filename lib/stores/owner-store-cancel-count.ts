import type { SupabaseClient } from "@supabase/supabase-js";

/** 매장별 `order_status = cancel_requested` 건수 (C_store Action Required) */
export async function countCancelRequestedForStore(
  sb: SupabaseClient,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;

  const { count, error } = await sb
    .from("store_orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "cancel_requested");

  if (error) {
    console.error("[countCancelRequestedForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}
