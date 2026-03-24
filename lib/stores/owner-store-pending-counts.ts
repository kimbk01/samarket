import type { SupabaseClient } from "@supabase/supabase-js";

/** 접수 전(order_status=pending) 주문 건수 */
export async function countPendingAcceptForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("*", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "pending");
  if (error) {
    console.error("[countPendingAcceptForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}

/** 동네배달·접수 대기 건수 (알림음·강조용) */
export async function countPendingDeliveryAcceptForStore(
  sb: SupabaseClient<any>,
  storeId: string
): Promise<number> {
  const sid = storeId.trim();
  if (!sid) return 0;
  const { count, error } = await sb
    .from("store_orders")
    .select("*", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("order_status", "pending")
    .eq("fulfillment_type", "local_delivery");
  if (error) {
    console.error("[countPendingDeliveryAcceptForStore]", error);
    return 0;
  }
  return Math.max(0, Math.floor(Number(count) || 0));
}
