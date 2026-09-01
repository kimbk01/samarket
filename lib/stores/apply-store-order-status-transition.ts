import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  appendStoreOrderMessengerStatusTransition,
  syncStoreOrderMessengerRoomContextMeta,
} from "@/lib/community-messenger/store-order-chat-service";
import {
  notifyBuyerStoreOrderOwnerStatus,
  notifyBuyerStoreRefundApproved,
  notifyStoreOwnerBuyerCancelled,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";
import { markOrderNotificationsRead } from "@/lib/notifications/pipeline/notify-read-service";
import {
  createStoreOrderEvent,
  createStoreOrderStatusEvent,
  type StoreOrderActorRole,
} from "@/lib/stores/store-order-events";
import { invalidateStoreOrderDetailSnapshot } from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { ensureStoreSettlementForCompletedOrder } from "@/lib/stores/ensure-store-settlement";
import {
  ADMIN_CANCEL_REQUEST_RESTORE_STATUSES,
  allowedOrderTransitionsForActor,
  isDeliveryFulfillment,
  isValidOrderStatus,
  shouldRestoreStockOnCancel,
  type StoreOrderStatusActor,
  type StoreOrderSystemPurpose,
} from "@/lib/stores/order-status-transitions";
import { restoreStockForOrderLines } from "@/lib/stores/restore-order-stock";
import { computeAutoCompleteAtIso } from "@/lib/stores/store-auto-complete-config";
import { reverseCoinCreditsForOrder } from "@/lib/currency/coin-reversal-writer";
import { reverseSaleFeeForOrder } from "@/lib/currency/sale-fee-writer";
import { recognizeOrderCurrencyOnCompleted } from "@/lib/currency/recognize-order-currency-on-completed";
import { applyStoreOrderPopularityProjectionOnCompleted } from "@/lib/stores/discovery/store-order-popularity-projection";

export type ApplyOrderStatusResult =
  | { ok: true; order_status: string; previous: string; idempotent?: boolean }
  | { ok: false; error: string; httpStatus: number };

export type ApplyStoreOrderStatusTransitionOpts = {
  orderId: string;
  nextStatus: string;
  /** Default OWNER (owner PATCH / backward compat) */
  actor?: StoreOrderStatusActor;
  /** pending→accepted 전용 — 분 단위, 서버에서 estimated_ready_at·accepted_at 계산 */
  ownerAcceptPrepMinutes?: number | null;
  /** ADMIN cancel_requested → previous_order_status */
  restoreToStatus?: string | null;
  /** SYSTEM cron: require auto_complete_at <= now */
  requireAutoCompleteDue?: boolean;
  /** SYSTEM external-delivery webhook uses OWNER graph; payment_failure cancels pending */
  systemPurpose?: StoreOrderSystemPurpose;
  /** Optional note for domain events (e.g. cancel_rejected reason) */
  eventMessage?: string | null;
  eventMetadata?: Record<string, unknown>;
  audit: {
    actor_type: "user" | "system" | "admin";
    actor_id: string | null;
    action: string;
    ip?: string | null;
    user_agent?: string | null;
  };
};

function resolveActorRole(
  actor: StoreOrderStatusActor,
  auditType: "user" | "system" | "admin"
): StoreOrderActorRole {
  if (actor === "CUSTOMER") return "buyer";
  if (actor === "ADMIN" || auditType === "admin") return "admin";
  if (actor === "SYSTEM" || auditType === "system") return "system";
  return "owner";
}

function isAutoCompleteDue(autoCompleteAt: unknown): boolean {
  if (autoCompleteAt == null) return false;
  const t = Date.parse(String(autoCompleteAt));
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

/**
 * store_orders.order_status 단일 runtime writer (create insert 제외).
 * Actor-scoped transitions · CAS · canonical side-effects.
 */
export async function applyStoreOrderStatusTransition(
  sb: SupabaseClient,
  opts: ApplyStoreOrderStatusTransitionOpts
): Promise<ApplyOrderStatusResult> {
  const oid = opts.orderId.trim();
  const nextStatus = opts.nextStatus.trim();
  const actor: StoreOrderStatusActor = opts.actor ?? "OWNER";

  if (!oid || !nextStatus || !isValidOrderStatus(nextStatus)) {
    return { ok: false, error: "invalid_order_status", httpStatus: 400 };
  }

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, order_status, fulfillment_type, payment_status, payment_amount, auto_complete_at, buyer_user_id, order_no, created_at"
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
    return { ok: true, order_status: current, previous: current, idempotent: true };
  }

  const systemPurpose: StoreOrderSystemPurpose =
    opts.systemPurpose ?? (opts.requireAutoCompleteDue ? "auto_complete" : "external_delivery");
  const autoCompleteDue =
    opts.requireAutoCompleteDue === true ? isAutoCompleteDue(order.auto_complete_at) : undefined;

  const allowed = allowedOrderTransitionsForActor(actor, current, fulfillment, {
    paymentStatus,
    restoreToStatus: opts.restoreToStatus ?? null,
    autoCompleteDue,
    systemPurpose: actor === "SYSTEM" ? systemPurpose : undefined,
  });
  if (!allowed.includes(nextStatus)) {
    return { ok: false, error: "invalid_transition", httpStatus: 400 };
  }

  if (actor === "OWNER" && current === "pending" && nextStatus === "accepted") {
    const raw = opts.ownerAcceptPrepMinutes;
    const mins = raw == null ? NaN : Math.floor(Number(raw));
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) {
      return { ok: false, error: "prep_minutes_required", httpStatus: 400 };
    }
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

  if (nextStatus === "cancelled") {
    // Recovery Chain: all cancel actors converge payment terminal here.
    // payment_failure keeps `failed` (set below) instead of `cancelled`.
    if (actor === "SYSTEM" && systemPurpose === "payment_failure") {
      updatePayload.payment_status = "failed";
    } else {
      updatePayload.payment_status = "cancelled";
    }
  }

  if (nextStatus === "refunded") {
    const nowIso = new Date().toISOString();
    updatePayload.payment_status = "refunded";
    updatePayload.auto_complete_at = null;
    updatePayload.refund_approved_at = nowIso;
    updatePayload.refunded_at = nowIso;
  }

  if (nextStatus === "cancel_requested") {
    updatePayload.auto_complete_at = null;
    updatePayload.needs_admin_attention = true;
  }

  if (current === "cancel_requested" && nextStatus !== "cancelled" && nextStatus !== "cancel_requested") {
    updatePayload.needs_admin_attention = false;
  }

  if (nextStatus === "completed" || nextStatus === "cancelled" || nextStatus === "refund_requested") {
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
  } else if (order.auto_complete_at != null && nextStatus !== "cancel_requested") {
    updatePayload.auto_complete_at = null;
  }

  const runCasUpdate = async (payload: Record<string, unknown>) => {
    const { data: updated, error } = await sb
      .from("store_orders")
      .update(payload)
      .eq("id", oid)
      .eq("order_status", current)
      .select("id")
      .maybeSingle();
    return { updated, error };
  };

  let { updated, error: uErr } =
    nextStatus === "refunded"
      ? { updated: null as { id?: string } | null, error: null as { message?: string } | null }
      : await runCasUpdate(updatePayload);

  /** G10: refund terminal + gift reverse in one DB TX (never after-the-fact reverse). */
  if (nextStatus === "refunded") {
    const { data: refundRpcRaw, error: refundRpcErr } = await sb.rpc(
      "gift_certificate_refund_order_atomic",
      {
        p_order_id: oid,
        p_actor_user_id: opts.audit.actor_id ?? null,
      }
    );
    if (refundRpcErr) {
      if (/gift_certificate_refund_order_atomic|schema cache|does not exist/i.test(refundRpcErr.message)) {
        return {
          ok: false,
          error: "gift_certificate_refund_order_atomic_missing",
          httpStatus: 503,
        };
      }
      console.error("[applyStoreOrderStatusTransition] gift_certificate_refund_order_atomic", refundRpcErr);
      return { ok: false, error: refundRpcErr.message, httpStatus: 500 };
    }
    const refundRow = (refundRpcRaw ?? {}) as Record<string, unknown>;
    if (refundRow.ok === false) {
      return {
        ok: false,
        error: String(refundRow.error ?? "gift_refund_failed"),
        httpStatus: 400,
      };
    }
    updated = { id: oid };
    uErr = null;
  }

  if (uErr) {
    const missingEtaCol =
      /estimated_prep_minutes|estimated_ready_at|accepted_at/i.test(String(uErr.message)) &&
      /does not exist/i.test(String(uErr.message));
    const missingRefundCol =
      /refund_approved_at|refunded_at/i.test(String(uErr.message)) &&
      /does not exist/i.test(String(uErr.message));
    const missingAdminCol =
      /needs_admin_attention/i.test(String(uErr.message)) && /does not exist/i.test(String(uErr.message));
    if (missingEtaCol || missingRefundCol || missingAdminCol) {
      const fallbackPayload = { ...updatePayload };
      if (missingEtaCol) {
        delete fallbackPayload.estimated_prep_minutes;
        delete fallbackPayload.estimated_ready_at;
        delete fallbackPayload.accepted_at;
      }
      if (missingRefundCol) {
        delete fallbackPayload.refund_approved_at;
        delete fallbackPayload.refunded_at;
      }
      if (missingAdminCol) {
        delete fallbackPayload.needs_admin_attention;
      }
      ({ updated, error: uErr } = await runCasUpdate(fallbackPayload));
    }
  }

  if (uErr) {
    const uMsg = String(uErr.message ?? "");
    if (uMsg.includes("auto_complete_at") && uMsg.includes("does not exist")) {
      const slim: Record<string, unknown> = { order_status: nextStatus };
      if (updatePayload.payment_status) slim.payment_status = updatePayload.payment_status;
      ({ updated, error: uErr } = await runCasUpdate(slim));
      if (uErr) {
        console.error("[applyStoreOrderStatusTransition]", uErr);
        return { ok: false, error: String(uErr.message ?? "update_failed"), httpStatus: 500 };
      }
    } else {
      console.error("[applyStoreOrderStatusTransition]", uErr);
      return { ok: false, error: uMsg || "update_failed", httpStatus: 500 };
    }
  }

  if (!updated) {
    return { ok: false, error: "transition_conflict", httpStatus: 409 };
  }

  /** Side-effects only after successful CAS — avoid duplicate stock/settlement on conflict */
  if (nextStatus === "cancelled" && shouldRestoreStockOnCancel(current)) {
    const { data: lines, error: iErr } = await sb
      .from("store_order_items")
      .select("product_id, qty")
      .eq("order_id", oid);
    if (iErr) {
      console.error("[applyStoreOrderStatusTransition] items", iErr);
    } else {
      await restoreStockForOrderLines(
        sb,
        (lines ?? []).map((r) => ({
          product_id: r.product_id as string,
          qty: r.qty as number,
        }))
      );
    }
  }

  if (nextStatus === "refunded") {
    const { data: lines, error: iErr } = await sb
      .from("store_order_items")
      .select("product_id, qty")
      .eq("order_id", oid);
    if (!iErr) {
      await restoreStockForOrderLines(
        sb,
        (lines ?? []).map((r) => ({
          product_id: r.product_id as string,
          qty: r.qty as number,
        }))
      );
    }
    const { error: payErr } = await sb
      .from("store_payments")
      .update({ status: "refunded" })
      .eq("order_id", oid)
      .eq("status", "succeeded");
    if (payErr && !payErr.message?.includes("does not exist")) {
      console.error("[applyStoreOrderStatusTransition] store_payments", payErr);
    }
    await cancelScheduledSettlementForOrder(sb, oid);
    await adjustStoreSettlementOnRefund(sb, {
      orderId: oid,
      refundAmount: undefined,
      note: "admin_refund_completed",
    });
    const coinReversal = await reverseCoinCreditsForOrder(sb, {
      orderId: oid,
      reason: "order_refund",
    });
    if (!coinReversal.ok && coinReversal.error !== "rpc_missing") {
      console.error("[applyStoreOrderStatusTransition] coin_reversal", coinReversal.error);
    }
    const saleFeeReversal = await reverseSaleFeeForOrder(sb, oid);
    if (!saleFeeReversal.ok && saleFeeReversal.error !== "rpc_missing") {
      console.error("[applyStoreOrderStatusTransition] sale_fee_reversal", saleFeeReversal.error);
    }
    await sb.rpc("restore_store_coupon_entitlement", {
      p_order_id: oid,
      p_allow_after_completed: true,
    });
    // Gift reverse already committed inside gift_certificate_refund_order_atomic.
  }

  if (nextStatus === "cancelled") {
    await cancelScheduledSettlementForOrder(sb, oid);
    await sb.rpc("restore_store_coupon_entitlement", {
      p_order_id: oid,
      p_allow_after_completed: false,
    });
  }
  if (nextStatus === "completed") {
    await ensureStoreSettlementForCompletedOrder(sb, oid);
    const currencyRec = await recognizeOrderCurrencyOnCompleted(sb, oid);
    if (!currencyRec.ok) {
      console.error("[applyStoreOrderStatusTransition] currency_recognition", currencyRec.error);
    }
    const createdAt = String(order.created_at ?? "").trim();
    if (createdAt) {
      void applyStoreOrderPopularityProjectionOnCompleted(sb, {
        orderId: oid,
        storeId: sid,
        orderCreatedAt: createdAt,
      });
    }
  }

  /**
   * Notification Event SSOT — owner intake attention end.
   * Business status transition = owner handled the order → end unread order_status for that order.
   * DO NOT leave commerce:owner:new_order:* unread after accept/progress (Bell inflation root cause).
   * @see docs/notifications/notification-event-ssot.md §3
   */
  {
    const { data: storeRow } = await sb
      .from("stores")
      .select("owner_user_id")
      .eq("id", sid)
      .maybeSingle();
    const ownerUid = String(storeRow?.owner_user_id ?? "").trim();
    const actorUid =
      opts.audit.actor_type === "user" || opts.audit.actor_type === "admin"
        ? String(opts.audit.actor_id ?? "").trim()
        : "";
    const viewers = new Set<string>();
    if (ownerUid) viewers.add(ownerUid);
    if (actorUid) viewers.add(actorUid);
    for (const uid of viewers) {
      void markOrderNotificationsRead(sb, uid, oid);
    }
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
      actor,
    },
    after_json: {
      order_status: nextStatus,
      store_id: sid,
      ...(updatePayload.payment_status ? { payment_status: updatePayload.payment_status } : {}),
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

  const actorRole = resolveActorRole(actor, opts.audit.actor_type);
  const statusEv = await createStoreOrderStatusEvent(sb, {
    orderId: oid,
    storeId: sid,
    fromStatus: current,
    toStatus: nextStatus,
    actorRole,
    audit: {
      actor_type: opts.audit.actor_type,
      actor_id: opts.audit.actor_id,
    },
    metadata: {
      apply_actor: actor,
      ...(opts.eventMetadata ?? {}),
    },
    message: opts.eventMessage ?? null,
  });

  // Recovery Chain domain events (formerly duplicated in admin cancel-request wrappers)
  if (current === "cancel_requested" && nextStatus === "cancelled") {
    void createStoreOrderEvent(sb, {
      orderId: oid,
      storeId: sid,
      actorUserId:
        opts.audit.actor_type === "admin" || opts.audit.actor_type === "user"
          ? opts.audit.actor_id
          : null,
      actorRole,
      eventType: "cancel_approved",
      fromStatus: current,
      toStatus: nextStatus,
      dedupeKey: `${oid}:cancel_approved`,
      metadata: {
        source: "apply_store_order_status_transition",
        ...(opts.eventMetadata ?? {}),
      },
    });
  } else if (
    current === "cancel_requested" &&
    ADMIN_CANCEL_REQUEST_RESTORE_STATUSES.has(nextStatus)
  ) {
    void createStoreOrderEvent(sb, {
      orderId: oid,
      storeId: sid,
      actorUserId:
        opts.audit.actor_type === "admin" || opts.audit.actor_type === "user"
          ? opts.audit.actor_id
          : null,
      actorRole,
      eventType: "cancel_rejected",
      fromStatus: current,
      toStatus: nextStatus,
      message: opts.eventMessage ?? null,
      dedupeKey: `${oid}:cancel_rejected:${nextStatus}`,
      metadata: {
        source: "apply_store_order_status_transition",
        ...(opts.eventMetadata ?? {}),
      },
    });
  }

  const buyerId = String(order.buyer_user_id ?? "").trim();
  const orderNo = String(order.order_no ?? "");

  if (nextStatus === "cancelled" && actor === "CUSTOMER") {
    const cancelNotify = { storeId: sid, orderId: oid, orderNo };
    if (statusEv.ok && statusEv.inserted) {
      void notifyStoreOwnerBuyerCancelled(sb, { ...cancelNotify, storeOrderEventId: statusEv.row.id });
    } else if (!statusEv.ok) {
      void notifyStoreOwnerBuyerCancelled(sb, cancelNotify);
    }
  } else if (nextStatus === "refund_requested") {
    const refundNotify = { storeId: sid, orderId: oid, orderNo };
    if (statusEv.ok && statusEv.inserted) {
      void notifyStoreOwnerRefundRequested(sb, { ...refundNotify, storeOrderEventId: statusEv.row.id });
    } else if (!statusEv.ok) {
      void notifyStoreOwnerRefundRequested(sb, refundNotify);
    }
  } else if (nextStatus === "refunded") {
    if (buyerId) {
      if (statusEv.ok && statusEv.inserted) {
        void notifyBuyerStoreRefundApproved(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo,
          storeId: sid,
          storeOrderEventId: statusEv.row.id,
        });
      } else if (!statusEv.ok) {
        void notifyBuyerStoreRefundApproved(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo,
          storeId: sid,
        });
      }
    }
  } else if (buyerId) {
    if (statusEv.ok) {
      if (statusEv.inserted) {
        void notifyBuyerStoreOrderOwnerStatus(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo,
          storeId: sid,
          nextStatus,
          storeOrderEventId: statusEv.row.id,
        });
      }
    } else {
      void notifyBuyerStoreOrderOwnerStatus(sb, {
        buyerUserId: buyerId,
        orderId: oid,
        orderNo,
        storeId: sid,
        nextStatus,
      });
    }
  }

  try {
    await appendStoreOrderMessengerStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      current,
      nextStatus
    );
  } catch (err) {
    console.error("[applyStoreOrderStatusTransition] messenger status transition failed", {
      orderId: oid,
      from: current,
      to: nextStatus,
      error: err,
    });
  }

  try {
    await syncStoreOrderMessengerRoomContextMeta(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid
    );
  } catch (err) {
    console.error("[applyStoreOrderStatusTransition] sync context meta failed", {
      orderId: oid,
      error: err,
    });
  }

  invalidateStoreOrderDetailSnapshot(oid, buyerId || undefined, `status_${nextStatus}`);
  invalidateBuyerStoreOrdersListSnapshot(buyerId || undefined, `status_${nextStatus}`);

  return { ok: true, order_status: nextStatus, previous: current };
}
