import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export async function logStoreOrderStockRestoreFailure(
  sb: SupabaseClient,
  params: {
    orderId?: string | null;
    productId: string;
    delta: number;
    message: string;
    rollbackRemaining: { id: string; delta: number }[];
  }
): Promise<void> {
  const targetId = params.orderId?.trim() || params.productId;
  console.error("[store-orders] stock_restore_failed", {
    order_id: params.orderId ?? null,
    product_id: params.productId,
    delta: params.delta,
    message: params.message,
    rollback_remaining: params.rollbackRemaining,
  });
  await appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "store_order",
    target_id: targetId,
    action: "store_order.stock_restore_failed",
    after_json: {
      product_id: params.productId,
      delta: params.delta,
      message: params.message,
      rollback_remaining: params.rollbackRemaining,
    },
  });
}
