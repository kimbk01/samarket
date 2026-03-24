import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  appendStoreOrderChatStatusTransition,
} from "@/lib/chat/store-order-chat-db";
import { notifyBuyerStoreOrderOwnerStatus } from "@/lib/notifications/notify-store-commerce";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import {
  allowedOrderTransitions,
  isDeliveryFulfillment,
  isValidOrderStatus,
  shouldRestoreStockOnCancel,
} from "@/lib/stores/order-status-transitions";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";
import { computeAutoCompleteAtIso } from "@/lib/stores/store-auto-complete-config";

export type ApplyOrderStatusResult =
  | { ok: true; order_status: string; previous: string }
  | { ok: false; error: string; httpStatus: number };

/**
 * store_orders.order_status 전이 (오너 PATCH·시스템 웹훅 공통).
 * 허용 전이·재고·auto_complete_at·알림·채팅·감사로그까지 PATCH와 동일.
 */
export async function applyStoreOrderStatusTransition(
  sb: SupabaseClient,
  opts: {
    orderId: string;
    nextStatus: string;
    audit: {
      actor_type: "user" | "system";
      actor_id: string | null;
      action: string;
      ip?: string | null;
      user_agent?: string | null;
    };
  }
): Promise<ApplyOrderStatusResult> {
  const oid = opts.orderId.trim();
  const nextStatus = opts.nextStatus.trim();

  if (!oid || !nextStatus || !isValidOrderStatus(nextStatus)) {
    return { ok: false, error: "invalid_order_status", httpStatus: 400 };
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, order_status, fulfillment_type, payment_status, auto_complete_at, buyer_user_id, order_no"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) {
    return { ok: false, error: "order_not_found", httpStatus: 404 };
  }

  const current = order.order_status as string;
  const fulfillment = order.fulfillment_type as string;
  const paymentStatus = order.payment_status as string;
  const sid = order.store_id as string;

  if (current === nextStatus) {
    return { ok: true, order_status: current, previous: current };
  }

  const allowed = allowedOrderTransitions(current, fulfillment);
  if (!allowed.includes(nextStatus)) {
    return { ok: false, error: "invalid_transition", httpStatus: 400 };
  }

  if (nextStatus === "cancelled" && shouldRestoreStockOnCancel(current)) {
    const { data: lines, error: iErr } = await sb
      .from("store_order_items")
      .select("product_id, qty")
      .eq("order_id", oid);
    if (iErr) {
      console.error("[applyStoreOrderStatusTransition] items", iErr);
      return { ok: false, error: iErr.message, httpStatus: 500 };
    }
    await restoreStockForOrderLines(
      sb,
      (lines ?? []).map((r) => ({
        product_id: r.product_id as string,
        qty: r.qty as number,
      }))
    );
  }

  const updatePayload: Record<string, unknown> = { order_status: nextStatus };
  const deliveryLike = isDeliveryFulfillment(fulfillment);

  if (nextStatus === "completed" || nextStatus === "cancelled") {
    updatePayload.auto_complete_at = null;
  } else if (nextStatus === "ready_for_pickup" && !deliveryLike) {
    if (order.auto_complete_at == null) {
      const commerce = await loadCommerceSettings(sb);
      updatePayload.auto_complete_at = computeAutoCompleteAtIso(commerce.autoCompleteDays);
    }
  } else if (nextStatus === "arrived" && deliveryLike) {
    if (order.auto_complete_at == null) {
      const commerce = await loadCommerceSettings(sb);
      updatePayload.auto_complete_at = computeAutoCompleteAtIso(commerce.autoCompleteDays);
    }
  } else if (order.auto_complete_at != null) {
    updatePayload.auto_complete_at = null;
  }

  const { error: uErr } = await sb.from("store_orders").update(updatePayload).eq("id", oid);

  if (uErr) {
    if (uErr.message?.includes("auto_complete_at") && uErr.message.includes("does not exist")) {
      const { error: fallbackErr } = await sb
        .from("store_orders")
        .update({ order_status: nextStatus })
        .eq("id", oid);
      if (fallbackErr) {
        console.error("[applyStoreOrderStatusTransition]", fallbackErr);
        return { ok: false, error: fallbackErr.message, httpStatus: 500 };
      }
    } else {
      console.error("[applyStoreOrderStatusTransition]", uErr);
      return { ok: false, error: uErr.message, httpStatus: 500 };
    }
  }

  if (nextStatus === "cancelled") {
    await cancelScheduledSettlementForOrder(sb, oid);
  }

  void appendAuditLog(sb, {
    actor_type: opts.audit.actor_type,
    actor_id: opts.audit.actor_id,
    target_type: "store_order",
    target_id: oid,
    action: opts.audit.action,
    before_json: {
      order_status: current,
      payment_status: paymentStatus,
      store_id: sid,
    },
    after_json: {
      order_status: nextStatus,
      store_id: sid,
    },
    ip: opts.audit.ip ?? null,
    user_agent: opts.audit.user_agent ?? null,
  });

  void notifyBuyerStoreOrderOwnerStatus(sb, {
    buyerUserId: order.buyer_user_id as string,
    orderId: oid,
    orderNo: String(order.order_no ?? ""),
    storeId: sid,
    nextStatus,
  });

  try {
    await appendStoreOrderChatStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      current,
      nextStatus
    );
  } catch {
    /* ignore */
  }

  return { ok: true, order_status: nextStatus, previous: current };
}
