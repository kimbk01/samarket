import type { SupabaseClient } from "@supabase/supabase-js";

/** 주문 취소 시 예정(scheduled) 정산만 취소 처리 */
export async function cancelScheduledSettlementForOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { error } = await sb
    .from("store_settlements")
    .update({ settlement_status: "cancelled" })
    .eq("order_id", oid)
    .eq("settlement_status", "scheduled");

  if (!error) return;
  if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) {
    return;
  }
  console.error("[cancelScheduledSettlementForOrder]", error);
}
