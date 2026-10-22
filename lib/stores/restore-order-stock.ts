import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateStorePublicMenusAfterOrderStockRestore } from "@/lib/stores/invalidate-store-public-menus-after-order-stock";

/**
 * Restore inventory for a terminal cancel/refund order.
 * CUT 3: DB atomic increment + one claim per order (idempotent).
 */
export async function restoreStockForOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<{ ok: boolean; idempotent?: boolean; error?: string }> {
  const oid = String(orderId ?? "").trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data, error } = await sb.rpc("restore_store_order_stock_atomic", {
    p_order_id: oid,
  });
  if (error) {
    if (/restore_store_order_stock_atomic|schema cache|does not exist/i.test(error.message)) {
      console.error("[restoreStockForOrder] rpc_missing", error.message);
      return { ok: false, error: "rpc_missing" };
    }
    console.error("[restoreStockForOrder]", error);
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, error: String(row.error ?? "stock_restore_failed") };
  }
  /** CRT-07 — 재고 추적 상품이 복원(품절 'stock' → 판매 재개 포함)됐으면 소비자 메뉴 캐시 무효화 */
  if (row.idempotent !== true && Number(row.restored_products ?? 0) > 0) {
    invalidateStorePublicMenusAfterOrderStockRestore(sb, oid);
  }
  return { ok: true, idempotent: row.idempotent === true };
}

/** @deprecated Prefer restoreStockForOrder(orderId) — RMW path removed for CUT 3. */
export async function restoreStockForOrderLines(
  sb: SupabaseClient,
  _lines: { product_id: string; qty: number }[],
  orderId?: string
): Promise<void> {
  if (!orderId) {
    console.error("[restoreStockForOrderLines] orderId required after CUT 3");
    return;
  }
  await restoreStockForOrder(sb, orderId);
}
