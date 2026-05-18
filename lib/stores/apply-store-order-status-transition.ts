import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { appendStoreOrderMessengerStatusTransition } from "@/lib/community-messenger/store-order-chat-service";
import { notifyBuyerStoreOrderOwnerStatus } from "@/lib/notifications/notify-store-commerce";
import { createStoreOrderStatusEvent } from "@/lib/stores/store-order-events";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { ensureStoreSettlementForCompletedOrder } from "@/lib/stores/ensure-store-settlement";
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
    /** pending→accepted 전용 — 분 단위, 서버에서 estimated_ready_at·accepted_at 계산 */
    ownerAcceptPrepMinutes?: number | null;
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

  if (current === "pending" && nextStatus === "accepted") {
    const raw = opts.ownerAcceptPrepMinutes;
    const mins = raw == null ? NaN : Math.floor(Number(raw));
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) {
      return { ok: false, error: "prep_minutes_required", httpStatus: 400 };
    }
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

  if (current === "pending" && nextStatus === "accepted") {
    const mins = Math.floor(Number(opts.ownerAcceptPrepMinutes));
    const serverNow = Date.now();
    updatePayload.accepted_at = new Date(serverNow).toISOString();
    updatePayload.estimated_prep_minutes = mins;
    updatePayload.estimated_ready_at = new Date(serverNow + mins * 60_000).toISOString();
  }

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

  let uErr = (await sb.from("store_orders").update(updatePayload).eq("id", oid)).error;

  if (uErr) {
    const missingEtaCol =
      /estimated_prep_minutes|estimated_ready_at|accepted_at/i.test(String(uErr.message)) &&
      /does not exist/i.test(String(uErr.message));
    if (missingEtaCol) {
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.estimated_prep_minutes;
      delete fallbackPayload.estimated_ready_at;
      delete fallbackPayload.accepted_at;
      const retry = await sb.from("store_orders").update(fallbackPayload).eq("id", oid);
      uErr = retry.error;
    }
  }

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
  if (nextStatus === "completed") {
    await ensureStoreSettlementForCompletedOrder(sb, oid);
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
      ...(current === "pending" && nextStatus === "accepted"
        ? {
            estimated_prep_minutes: updatePayload.estimated_prep_minutes,
            estimated_ready_at: updatePayload.estimated_ready_at,
            accepted_at: updatePayload.accepted_at,
          }
        : {}),
    },
    ip: opts.audit.ip ?? null,
    user_agent: opts.audit.user_agent ?? null,
  });

  const statusEv = await createStoreOrderStatusEvent(sb, {
    orderId: oid,
    storeId: sid,
    fromStatus: current,
    toStatus: nextStatus,
    audit: {
      actor_type: opts.audit.actor_type,
      actor_id: opts.audit.actor_id,
    },
  });

  if (statusEv.ok) {
    if (statusEv.inserted) {
      void notifyBuyerStoreOrderOwnerStatus(sb, {
        buyerUserId: order.buyer_user_id as string,
        orderId: oid,
        orderNo: String(order.order_no ?? ""),
        storeId: sid,
        nextStatus,
        storeOrderEventId: statusEv.row.id,
      });
    }
  } else {
    /** 이벤트 원장 삽입 실패 시에도 알림은 dedupe_key(order_id+status 기반)로 1회만 */
    void notifyBuyerStoreOrderOwnerStatus(sb, {
      buyerUserId: order.buyer_user_id as string,
      orderId: oid,
      orderNo: String(order.order_no ?? ""),
      storeId: sid,
      nextStatus,
    });
  }

  try {
    await appendStoreOrderMessengerStatusTransition(
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
