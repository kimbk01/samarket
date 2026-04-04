import type { SupabaseClient } from "@supabase/supabase-js";
import { appendOrderChatPaymentCompletedLine } from "@/lib/order-chat/service";
import {
  notifyBuyerStorePaymentCompleted,
  notifyBuyerStorePaymentFailed,
  notifyStoreOwnerPaymentCompleted,
} from "@/lib/notifications/notify-store-commerce";
import { ensureStoreSettlementForPaidOrder } from "@/lib/stores/ensure-store-settlement";

export type RecordPaidOk = {
  ok: true;
  payment_status: "paid";
  already?: boolean;
  reconciled?: boolean;
};

export type RecordPaidErr = {
  ok: false;
  error: string;
  httpStatus: number;
  hint?: string;
};

export type RecordPaidResult = RecordPaidOk | RecordPaidErr;

/**
 * 주문 결제 성공 기록: store_payments + store_orders.payment_status=paid (멱등)
 */
export async function recordStoreOrderPaid(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    provider: string;
    providerPaymentId: string;
    amountFromGateway?: number;
    meta?: Record<string, unknown>;
  }
): Promise<RecordPaidResult> {
  const oid = opts.orderId.trim();
  if (!oid) {
    return { ok: false, error: "missing_order_id", httpStatus: 400 };
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, payment_amount, payment_status, order_status, store_id, order_no, buyer_user_id")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "order_not_found", httpStatus: 404 };
  }

  if (order.payment_status === "paid") {
    await ensureStoreSettlementForPaidOrder(sb, oid);
    return { ok: true, payment_status: "paid", already: true };
  }

  if (order.order_status === "cancelled" || order.payment_status === "cancelled") {
    return { ok: false, error: "order_cancelled", httpStatus: 400 };
  }

  if (order.payment_status !== "pending" && order.payment_status !== "failed") {
    return { ok: false, error: "invalid_payment_state", httpStatus: 400 };
  }

  const expected = Math.round(Number(order.payment_amount) || 0);
  if (
    opts.amountFromGateway != null &&
    Number.isFinite(opts.amountFromGateway) &&
    Math.round(opts.amountFromGateway) !== expected
  ) {
    return { ok: false, error: "amount_mismatch", httpStatus: 400 };
  }

  const amount = expected;
  const meta = { ...opts.meta, provider: opts.provider };

  const { error: insErr } = await sb.from("store_payments").insert({
    order_id: oid,
    provider: opts.provider,
    provider_payment_id: opts.providerPaymentId,
    amount,
    status: "succeeded",
    meta,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      const { error: uOnly } = await sb.from("store_orders").update({ payment_status: "paid" }).eq("id", oid);
      if (uOnly) {
        return { ok: false, error: uOnly.message, httpStatus: 500 };
      }
      await ensureStoreSettlementForPaidOrder(sb, oid);
      void notifyStoreOwnerPaymentCompleted(sb, {
        storeId: order.store_id as string,
        orderId: oid,
        orderNo: String(order.order_no ?? ""),
        paymentAmount: amount,
      });
      const buyerId = String((order as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
      if (buyerId) {
        void notifyBuyerStorePaymentCompleted(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo: String(order.order_no ?? ""),
          storeId: order.store_id as string,
        });
      }
      void appendOrderChatPaymentCompletedLine(
        sb as import("@supabase/supabase-js").SupabaseClient<any>,
        oid
      ).catch((e) => console.error("[recordStoreOrderPaid] payment chat line", e));
      return { ok: true, payment_status: "paid", reconciled: true };
    }
    if (insErr.message?.includes("store_payments") && insErr.message?.includes("does not exist")) {
      return {
        ok: false,
        error: "store_payments_table_missing",
        httpStatus: 503,
        hint: "apply migration store_payments",
      };
    }
    console.error("[recordStoreOrderPaid insert]", insErr);
    return { ok: false, error: insErr.message, httpStatus: 500 };
  }

  const { error: uErr } = await sb.from("store_orders").update({ payment_status: "paid" }).eq("id", oid);

  if (uErr) {
    console.error("[recordStoreOrderPaid update order]", uErr);
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }

  await ensureStoreSettlementForPaidOrder(sb, oid);
  void notifyStoreOwnerPaymentCompleted(sb, {
    storeId: order.store_id as string,
    orderId: oid,
    orderNo: String(order.order_no ?? ""),
    paymentAmount: amount,
  });
  const buyerId = String((order as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
  if (buyerId) {
    void notifyBuyerStorePaymentCompleted(sb, {
      buyerUserId: buyerId,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
      storeId: order.store_id as string,
    });
  }
  void appendOrderChatPaymentCompletedLine(
    sb as import("@supabase/supabase-js").SupabaseClient<any>,
    oid
  ).catch((e) => console.error("[recordStoreOrderPaid] payment chat line", e));
  return { ok: true, payment_status: "paid" };
}

export type RecordFailedResult =
  | { ok: true; payment_status: "failed" }
  | { ok: false; error: string; httpStatus: number };

/**
 * 결제 실패: 주문만 failed (원장은 성공 시 1건만 두는 전제 — 실패는 주문 상태로만 표시)
 */
export async function recordStoreOrderPaymentFailed(
  sb: SupabaseClient,
  opts: { orderId: string }
): Promise<RecordFailedResult> {
  const oid = opts.orderId.trim();
  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, payment_status, order_status, buyer_user_id, order_no, store_id")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "order_not_found", httpStatus: 404 };
  }
  if (order.payment_status === "paid") {
    return { ok: false, error: "already_paid", httpStatus: 409 };
  }
  if (order.order_status === "cancelled") {
    return { ok: false, error: "order_cancelled", httpStatus: 400 };
  }
  if (order.payment_status !== "pending") {
    return { ok: true, payment_status: "failed" };
  }

  const { error: uErr } = await sb
    .from("store_orders")
    .update({ payment_status: "failed" })
    .eq("id", oid)
    .eq("payment_status", "pending");

  if (uErr) {
    return { ok: false, error: uErr.message, httpStatus: 500 };
  }
  void notifyBuyerStorePaymentFailed(sb, {
    buyerUserId: order.buyer_user_id as string,
    orderId: oid,
    orderNo: String(order.order_no ?? ""),
    storeId: order.store_id as string,
  });
  return { ok: true, payment_status: "failed" };
}
