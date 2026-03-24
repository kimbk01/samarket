import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";

export type ApplyAdminRefundOk = {
  ok: true;
  already?: boolean;
};

export type ApplyAdminRefundErr = {
  ok: false;
  error: string;
  httpStatus: number;
};

export type ApplyAdminRefundResult = ApplyAdminRefundOk | ApplyAdminRefundErr;

/**
 * 관리자 환불 승인: 주문·결제 상태를 refunded로, 예정 정산 취소, 재고 복구 (PG 실환불은 별도)
 */
export async function applyAdminStoreOrderRefund(
  sb: SupabaseClient,
  orderId: string
): Promise<ApplyAdminRefundResult> {
  const oid = orderId.trim();
  if (!oid) {
    return { ok: false, error: "missing_order_id", httpStatus: 400 };
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, order_status, payment_status")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "order_not_found", httpStatus: 404 };
  }

  const os = order.order_status as string;
  const ps = order.payment_status as string;

  if (os === "refunded" && ps === "refunded") {
    return { ok: true, already: true };
  }

  if (os !== "refund_requested") {
    return { ok: false, error: "refund_not_requested", httpStatus: 400 };
  }

  const { data: lines, error: iErr } = await sb
    .from("store_order_items")
    .select("product_id, qty")
    .eq("order_id", oid);

  if (iErr) {
    console.error("[applyAdminStoreOrderRefund] items", iErr);
    return { ok: false, error: iErr.message, httpStatus: 500 };
  }

  await restoreStockForOrderLines(
    sb,
    (lines ?? []).map((r) => ({
      product_id: r.product_id as string,
      qty: r.qty as number,
    }))
  );

  const updateRow: Record<string, unknown> = {
    order_status: "refunded",
    payment_status: "refunded",
    auto_complete_at: null,
  };

  let { error: uErr } = await sb.from("store_orders").update(updateRow).eq("id", oid);

  if (uErr?.message?.includes("auto_complete_at") && uErr.message.includes("does not exist")) {
    const { error: fb } = await sb
      .from("store_orders")
      .update({ order_status: "refunded", payment_status: "refunded" })
      .eq("id", oid);
    uErr = fb ?? null;
  }

  if (uErr) {
    console.error("[applyAdminStoreOrderRefund] update order", uErr);
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }

  const { error: payErr } = await sb
    .from("store_payments")
    .update({ status: "refunded" })
    .eq("order_id", oid)
    .eq("status", "succeeded");

  if (payErr && !payErr.message?.includes("does not exist")) {
    console.error("[applyAdminStoreOrderRefund] store_payments", payErr);
  }

  await cancelScheduledSettlementForOrder(sb, oid);

  return { ok: true };
}
