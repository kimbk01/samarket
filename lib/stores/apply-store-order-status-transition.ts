import type { SupabaseClient } from "@supabase/supabase-js";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  appendStoreOrderMessengerStatusTransition,
  syncStoreOrderMessengerRoomContextMeta,
} from "@/lib/community-messenger/store-order-chat-service";
import {
  notifyBuyerStoreOrderAutoCompleted,
  notifyBuyerStoreOrderOwnerStatus,
  notifyStoreOwnerAcceptTimeoutCancelled,
  notifyBuyerStoreRefundApproved,
  notifyBuyerStoreRefundRejected,
  notifyStoreOwnerBuyerCancelled,
  notifyStoreOwnerRefundRequested,
} from "@/lib/notifications/notify-store-commerce";
import { markOrderNotificationsRead } from "@/lib/notifications/pipeline/notify-read-service";
import {
  createStoreOrderEvent,
  createStoreOrderStatusEvent,
  type StoreOrderActorRole,
} from "@/lib/stores/store-order-events";
import {
  invalidateStoreOrderDetailSnapshot,
  purgeStoreOrderDetailSnapshotRows,
} from "@/lib/stores/store-order-detail-snapshot-cache";
import { invalidateBuyerStoreOrdersListSnapshot } from "@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache";
import { cancelScheduledSettlementForOrder } from "@/lib/stores/cancel-store-settlement";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { ensureStoreSettlementForCompletedOrder } from "@/lib/stores/ensure-store-settlement";
import { STORE_ORDER_CLOSED_STATUSES } from "@/lib/admin/admin-ops-actionable-status";
import {
  ADMIN_CANCEL_REQUEST_RESTORE_STATUSES,
  ADMIN_REFUND_REQUEST_RESTORE_STATUSES,
  allowedOrderTransitionsForActor,
  isDeliveryFulfillment,
  isValidOrderStatus,
  shouldRestoreStockOnCancel,
  type StoreOrderStatusActor,
  type StoreOrderSystemPurpose,
} from "@/lib/stores/order-status-transitions";
import { restoreStockForOrder } from "@/lib/stores/restore-order-stock";
import { computeAutoCompleteAtIso } from "@/lib/stores/store-auto-complete-config";
import { reverseCoinCreditsForOrder } from "@/lib/currency/coin-reversal-writer";
import { STORE_COMMISSION_CHARGE_FAILED_ERROR } from "@/lib/stores/commission/store-commission-contract";
import { recognizeOrderCurrencyOnCompleted } from "@/lib/currency/recognize-order-currency-on-completed";
import { applyStoreOrderPopularityProjectionOnCompleted } from "@/lib/stores/discovery/store-order-popularity-projection";

/**
 * Request rejections that notify the buyer with the reason (store or admin decision).
 * The reject paths set `eventMetadata.source`; an admin-only reason never goes here.
 */
const REQUEST_REJECT_SOURCES = new Set([
  "admin_refund_reject",
  "admin_cancel_request_reject",
  "owner_refund_reject",
  "owner_cancel_request_reject",
]);

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
  /**
   * Status the caller read and decided on. When set, a different current status → 409
   * `transition_conflict` and the CAS runs against this status (callers that recorded the
   * previous status elsewhere, e.g. the cancel-request ledger, must not apply on a newer one).
   */
  expectedCurrentStatus?: string | null;
  /**
   * CUSTOMER → cancel_requested only (required there): the buyer's reason. The ledger row and the
   * status change are written by `store_order_buyer_cancel_request_atomic` in one transaction.
   */
  buyerCancelRequestReason?: string | null;
  /**
   * OWNER → cancelled only (ORD-06): the store's direct cancel. The approved ledger row and the status
   * change are written by `store_order_owner_cancel_atomic` in one transaction (pickup checked under
   * the delivery/order row locks). The reason reaches the buyer (ORD-09 / D-22).
   */
  ownerDirectCancel?: { reason: string; detail?: string | null } | null;
  /**
   * cancel_requested → cancelled (approve) / → ledger previous status (reject), store or admin (ORD-06).
   * Ledger decision + status change in one DB transaction via `store_order_cancel_request_decide_atomic`.
   */
  cancelRequestDecision?: {
    decision: "approve" | "reject";
    actorRole: "owner" | "admin";
    reason?: string | null;
  } | null;
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

const LEDGER_RPC_ERROR_MAP: Record<string, { error: string; httpStatus: number }> = {
  order_admin_locked: { error: "order_admin_locked", httpStatus: 409 },
  transition_conflict: { error: "transition_conflict", httpStatus: 409 },
  cancel_request_pending: { error: "cancel_request_pending", httpStatus: 409 },
  cancel_request_not_found: { error: "cancel_request_not_found", httpStatus: 404 },
  restore_status_mismatch: { error: "cancel_restore_status_unknown", httpStatus: 409 },
  picked_up: { error: "cancel_not_allowed_for_status", httpStatus: 400 },
  invalid_transition: { error: "invalid_transition", httpStatus: 400 },
  invalid_args: { error: "cancel_reason_required", httpStatus: 400 },
  reason_required: { error: "reason_required", httpStatus: 400 },
  order_not_found: { error: "order_not_found", httpStatus: 404 },
  forbidden: { error: "forbidden", httpStatus: 403 },
};

/** Delivery statuses that are still open (a courier could still act on the row). */
export const OPEN_DELIVERY_STATUSES = ["waiting_rider", "rider_assigned", "pickup_in_progress", "delivering"] as const;

/**
 * DLV-02 ③ — the order closed (cancelled / refunded): close an open delivery row so it leaves the
 * dispatch queue. Post-commit, best effort (moves into the cancel DB function in stage 2-C).
 */
async function closeOpenDeliveryRowOnOrderClosed(
  sb: SupabaseClient,
  orderId: string,
  closedStatus: "cancelled" | "refunded"
): Promise<void> {
  try {
    const { error } = await sb
      .from("store_order_deliveries")
      .update({
        delivery_status: "delivery_failed",
        failure_note: `order_${closedStatus}`,
        failed_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .in("delivery_status", [...OPEN_DELIVERY_STATUSES]);
    if (error && !/does not exist/i.test(String(error.message ?? ""))) {
      console.error("[applyStoreOrderStatusTransition] close_open_delivery", error.message);
    }
  } catch (err) {
    console.error("[applyStoreOrderStatusTransition] close_open_delivery", err);
  }
}

/**
 * Buyer notice for a plain status change (NTF-02/03, ORD-09).
 * SYSTEM: auto_complete → auto-complete notice · payment_failure → none (record-store-order-payment sends
 * the single payment-failed notice) · accept_timeout / delivery_sync → their own copy (not "the store did it").
 */
async function notifyBuyerOnStatusTransition(
  sb: SupabaseClient,
  input: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    nextStatus: string;
    actor: StoreOrderStatusActor;
    systemPurpose?: StoreOrderSystemPurpose;
    storeOrderEventId?: string;
    estimatedPrepMinutes?: number;
    cancelReason?: string;
  }
): Promise<void> {
  const ev = input.storeOrderEventId ? { storeOrderEventId: input.storeOrderEventId } : {};
  if (input.actor === "SYSTEM") {
    if (input.systemPurpose === "payment_failure") return;
    if (input.systemPurpose === "auto_complete" && input.nextStatus === "completed") {
      await notifyBuyerStoreOrderAutoCompleted(sb, {
        buyerUserId: input.buyerUserId,
        orderId: input.orderId,
        orderNo: input.orderNo,
        storeId: input.storeId,
        ...ev,
      });
      return;
    }
  }
  await notifyBuyerStoreOrderOwnerStatus(sb, {
    buyerUserId: input.buyerUserId,
    orderId: input.orderId,
    orderNo: input.orderNo,
    storeId: input.storeId,
    nextStatus: input.nextStatus,
    ...ev,
    actor: input.actor,
    systemPurpose: input.actor === "SYSTEM" ? input.systemPurpose : undefined,
    ...(input.estimatedPrepMinutes != null ? { estimatedPrepMinutes: input.estimatedPrepMinutes } : {}),
    ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
  });
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

  const expectedCurrent = opts.expectedCurrentStatus?.trim();
  if (expectedCurrent && expectedCurrent !== current) {
    return { ok: false, error: "transition_conflict", httpStatus: 409 };
  }

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

  const ownerDirectCancel = opts.ownerDirectCancel ?? null;
  const cancelDecision = opts.cancelRequestDecision ?? null;
  if (ownerDirectCancel && (actor !== "OWNER" || nextStatus !== "cancelled")) {
    return { ok: false, error: "invalid_transition", httpStatus: 400 };
  }
  if (cancelDecision) {
    const wanted = cancelDecision.decision === "approve" ? nextStatus === "cancelled" : nextStatus !== "cancelled";
    if (current !== "cancel_requested" || !wanted) {
      return { ok: false, error: "invalid_transition", httpStatus: 400 };
    }
  }
  const ownerCancelReason = ownerDirectCancel ? String(ownerDirectCancel.reason ?? "").trim().slice(0, 500) : "";
  if (ownerDirectCancel && !ownerCancelReason) {
    return { ok: false, error: "cancel_reason_required", httpStatus: 400 };
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
    // Cancel requests are the store owner's decision (3단계) — never flagged as admin workload.
  }

  if (current === "cancel_requested" && nextStatus !== "cancelled" && nextStatus !== "cancel_requested") {
    updatePayload.needs_admin_attention = false;
  }

  // Admin Q (R3): a closed order is never admin workload — clear the attention flag on close.
  if ((STORE_ORDER_CLOSED_STATUSES as readonly string[]).includes(nextStatus)) {
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

  const buyerCancelRequest = actor === "CUSTOMER" && nextStatus === "cancel_requested";
  const ledgerAtomic = ownerDirectCancel != null || cancelDecision != null;
  let { updated, error: uErr } =
    nextStatus === "refunded" || buyerCancelRequest || ledgerAtomic
      ? { updated: null as { id?: string } | null, error: null as { message?: string } | null }
      : await runCasUpdate(updatePayload);

  /** ORD-06: cancel ledger row + status in one DB TX (owner direct cancel / request decision). */
  if (ledgerAtomic) {
    const rpcName = ownerDirectCancel ? "store_order_owner_cancel_atomic" : "store_order_cancel_request_decide_atomic";
    const restoreAutoCompleteAt =
      "auto_complete_at" in updatePayload ? updatePayload.auto_complete_at : (order.auto_complete_at ?? null);
    const decisionReason = cancelDecision?.reason?.trim() ? cancelDecision.reason.trim().slice(0, 500) : null;
    const args = ownerDirectCancel
      ? {
          p_order_id: oid,
          p_store_id: sid,
          p_owner_user_id: opts.audit.actor_id,
          p_expected_status: current,
          p_reason: ownerCancelReason,
          p_detail: ownerDirectCancel.detail?.trim() ? ownerDirectCancel.detail.trim().slice(0, 500) : null,
        }
      : {
          p_order_id: oid,
          p_store_id: sid,
          p_actor_user_id: opts.audit.actor_id,
          p_actor_role: cancelDecision?.actorRole,
          p_expected_status: current,
          p_decision: cancelDecision?.decision,
          p_restore_status: cancelDecision?.decision === "reject" ? nextStatus : null,
          p_reason: decisionReason,
          p_auto_complete_at: cancelDecision?.decision === "reject" ? restoreAutoCompleteAt : null,
        };
    const { data: ledgerRaw, error: ledgerErr } = await sb.rpc(rpcName, args);
    if (ledgerErr) {
      const msg = String(ledgerErr.message ?? "");
      if (/store_commission_(charge_failed|policy_missing)/.test(msg)) {
        // Commission trigger refused inside the RPC's UPDATE → whole TX rolled back; handled below.
        uErr = ledgerErr;
      } else if (msg.includes(rpcName) || /schema cache|does not exist/i.test(msg)) {
        return { ok: false, error: `${rpcName}_missing`, httpStatus: 503 };
      } else {
        console.error(`[applyStoreOrderStatusTransition] ${rpcName}`, ledgerErr);
        return { ok: false, error: msg || "update_failed", httpStatus: 500 };
      }
    } else {
      const ledgerRow = (ledgerRaw ?? {}) as Record<string, unknown>;
      if (ledgerRow.ok !== true) {
        const code = String(ledgerRow.error ?? "cancel_ledger_failed");
        return { ok: false, ...(LEDGER_RPC_ERROR_MAP[code] ?? { error: code, httpStatus: 500 }) };
      }
      updated = { id: oid };
      uErr = null;
    }
  }

  /** D1: ledger row + status in one DB TX, delivery pickup checked under row locks (never ledger-then-delete). */
  if (buyerCancelRequest) {
    const reason = opts.buyerCancelRequestReason?.trim() ?? "";
    if (!reason) return { ok: false, error: "cancel_reason_required", httpStatus: 400 };
    const { data: reqRaw, error: reqErr } = await sb.rpc("store_order_buyer_cancel_request_atomic", {
      p_order_id: oid,
      p_buyer_user_id: String(order.buyer_user_id ?? ""),
      p_expected_status: current,
      p_reason: reason,
    });
    if (reqErr) {
      if (/store_order_buyer_cancel_request_atomic|schema cache|does not exist/i.test(reqErr.message)) {
        return { ok: false, error: "store_order_buyer_cancel_request_atomic_missing", httpStatus: 503 };
      }
      console.error("[applyStoreOrderStatusTransition] store_order_buyer_cancel_request_atomic", reqErr);
      return { ok: false, error: reqErr.message, httpStatus: 500 };
    }
    const reqRow = (reqRaw ?? {}) as Record<string, unknown>;
    if (reqRow.ok !== true) {
      const code = String(reqRow.error ?? "cancel_request_failed");
      const mapped: Record<string, { error: string; httpStatus: number }> = {
        order_admin_locked: { error: "order_admin_locked", httpStatus: 409 },
        transition_conflict: { error: "transition_conflict", httpStatus: 409 },
        cancel_request_pending: { error: "cancel_request_pending", httpStatus: 409 },
        picked_up: { error: "cannot_request_cancel", httpStatus: 400 },
        invalid_transition: { error: "invalid_transition", httpStatus: 400 },
        order_not_found: { error: "order_not_found", httpStatus: 404 },
      };
      return { ok: false, ...(mapped[code] ?? { error: code, httpStatus: 500 }) };
    }
    updated = { id: oid };
    uErr = null;
  }

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
    // NTF-05: a concurrent approval already refunded this order (and ran the side effects) → no repeat.
    if (refundRow.idempotent === true) {
      return { ok: true, order_status: "refunded", previous: current, idempotent: true };
    }
    updated = { id: oid };
    uErr = null;
    // RPC owns the money transition; clear the Admin Q flag separately (non-financial column).
    const { error: flagErr } = await sb
      .from("store_orders")
      .update({ needs_admin_attention: false })
      .eq("id", oid)
      .eq("order_status", "refunded");
    if (flagErr && !/needs_admin_attention/i.test(flagErr.message)) {
      console.error("[applyStoreOrderStatusTransition] clear needs_admin_attention", flagErr);
    }
  }

  // DB trigger refused the status change (commission could not be charged, e.g. no fee policy).
  // The order did NOT move — the whole UPDATE rolled back.
  if (uErr && /store_commission_(charge_failed|policy_missing)/.test(String(uErr.message ?? ""))) {
    console.error("[applyStoreOrderStatusTransition] commission_charge_refused", uErr.message);
    // Financial exception → one admin alert per (order, target status); best effort, never blocks the 409.
    const notified = await sb
      .rpc("store_commission_notify_charge_failure", {
        p_order_id: oid,
        p_target_status: nextStatus,
        p_error: String(uErr.message ?? ""),
      })
      .then(
        (r) => r,
        (e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } })
      );
    if (notified.error) console.error("[applyStoreOrderStatusTransition] charge_failure_alert", notified.error.message);
    return {
      ok: false,
      error: /policy_missing/.test(String(uErr.message)) ? "store_commission_policy_missing" : STORE_COMMISSION_CHARGE_FAILED_ERROR,
      httpStatus: 409,
    };
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
    const stock = await restoreStockForOrder(sb, oid);
    if (!stock.ok && stock.error !== "rpc_missing") {
      console.error("[applyStoreOrderStatusTransition] stock_restore", stock.error);
    }
  }

  if (nextStatus === "refunded") {
    const stock = await restoreStockForOrder(sb, oid);
    if (!stock.ok && stock.error !== "rpc_missing") {
      console.error("[applyStoreOrderStatusTransition] stock_restore_refund", stock.error);
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
    // Commission: never auto-reversed. The DB trigger already queued it for admin review
    // in the same transaction as the status change (store-commission-contract).
    await sb.rpc("restore_store_coupon_entitlement", {
      p_order_id: oid,
      p_allow_after_completed: true,
    });
    // Gift reverse already committed inside gift_certificate_refund_order_atomic.
  }

  if (nextStatus === "cancelled" || nextStatus === "refunded") {
    await closeOpenDeliveryRowOnOrderClosed(sb, oid, nextStatus);
  }

  // 조리 시작 commission charge / cancel-refund review run inside the CAS UPDATE
  // (DB trigger trg_store_orders_commission_lifecycle) — nothing to do here.

  if (nextStatus === "cancelled") {
    await cancelScheduledSettlementForOrder(sb, oid);
    await sb.rpc("restore_store_coupon_entitlement", {
      p_order_id: oid,
      p_allow_after_completed: false,
    });
    /** CUT 2: gift restore via cancel-safe RPC (idempotent; not refund atomic). */
    const { data: giftCancelRaw, error: giftCancelErr } = await sb.rpc(
      "gift_certificate_cancel_order_restore",
      { p_order_id: oid }
    );
    if (giftCancelErr) {
      if (
        !/gift_certificate_cancel_order_restore|schema cache|does not exist/i.test(
          giftCancelErr.message
        )
      ) {
        console.error(
          "[applyStoreOrderStatusTransition] gift_certificate_cancel_order_restore",
          giftCancelErr
        );
      }
    } else {
      const giftCancelRow = (giftCancelRaw ?? {}) as Record<string, unknown>;
      if (giftCancelRow.ok === false && giftCancelRow.error !== "order_not_cancelled") {
        console.error(
          "[applyStoreOrderStatusTransition] gift_certificate_cancel_order_restore",
          giftCancelRow.error
        );
      }
    }
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
      await notifyStoreOwnerBuyerCancelled(sb, { ...cancelNotify, storeOrderEventId: statusEv.row.id });
    } else if (!statusEv.ok) {
      await notifyStoreOwnerBuyerCancelled(sb, cancelNotify);
    }
  } else if (nextStatus === "cancel_requested" && actor === "CUSTOMER") {
    // Buyer mid-flow cancel request → the store decides (approve / reject).
    const cancelReqNotify = { storeId: sid, orderId: oid, orderNo, request: "cancel" as const };
    if (statusEv.ok && statusEv.inserted) {
      await notifyStoreOwnerRefundRequested(sb, { ...cancelReqNotify, storeOrderEventId: statusEv.row.id });
    } else if (!statusEv.ok) {
      await notifyStoreOwnerRefundRequested(sb, cancelReqNotify);
    }
  } else if (nextStatus === "refund_requested") {
    const refundNotify = { storeId: sid, orderId: oid, orderNo };
    if (statusEv.ok && statusEv.inserted) {
      await notifyStoreOwnerRefundRequested(sb, { ...refundNotify, storeOrderEventId: statusEv.row.id });
    } else if (!statusEv.ok) {
      await notifyStoreOwnerRefundRequested(sb, refundNotify);
    }
  } else if (nextStatus === "refunded") {
    if (buyerId) {
      if (statusEv.ok && statusEv.inserted) {
        await notifyBuyerStoreRefundApproved(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo,
          storeId: sid,
          storeOrderEventId: statusEv.row.id,
        });
      } else if (!statusEv.ok) {
        await notifyBuyerStoreRefundApproved(sb, {
          buyerUserId: buyerId,
          orderId: oid,
          orderNo,
          storeId: sid,
        });
      }
    }
  } else if (
    buyerId &&
    ((current === "refund_requested" && ADMIN_REFUND_REQUEST_RESTORE_STATUSES.has(nextStatus)) ||
      (current === "cancel_requested" && ADMIN_CANCEL_REQUEST_RESTORE_STATUSES.has(nextStatus))) &&
    REQUEST_REJECT_SOURCES.has(String((opts.eventMetadata as { source?: string } | undefined)?.source ?? ""))
  ) {
    const rejectReason = String(
      (opts.eventMetadata as { rejected_reason?: string } | undefined)?.rejected_reason ??
        opts.eventMessage ??
        ""
    );
    if (statusEv.ok && statusEv.inserted) {
      await notifyBuyerStoreRefundRejected(sb, {
        buyerUserId: buyerId,
        orderId: oid,
        orderNo,
        storeId: sid,
        reason: rejectReason,
        storeOrderEventId: statusEv.row.id,
        request: current === "cancel_requested" ? "cancel" : "refund",
      });
    } else if (!statusEv.ok) {
      await notifyBuyerStoreRefundRejected(sb, {
        buyerUserId: buyerId,
        orderId: oid,
        orderNo,
        storeId: sid,
        reason: rejectReason,
        request: current === "cancel_requested" ? "cancel" : "refund",
      });
    }
  } else if (buyerId && (!statusEv.ok || statusEv.inserted)) {
    await notifyBuyerOnStatusTransition(sb, {
      buyerUserId: buyerId,
      orderId: oid,
      orderNo,
      storeId: sid,
      nextStatus,
      actor,
      systemPurpose: actor === "SYSTEM" ? systemPurpose : undefined,
      ...(statusEv.ok ? { storeOrderEventId: statusEv.row.id } : {}),
      // NTF-03: the accept notice carries the prep ETA the store just set.
      ...(nextStatus === "accepted" && typeof updatePayload.estimated_prep_minutes === "number"
        ? { estimatedPrepMinutes: updatePayload.estimated_prep_minutes }
        : {}),
      // ORD-09 / D-22: the store's cancel reason reaches the buyer verbatim (≤500 chars).
      ...(ownerCancelReason ? { cancelReason: ownerCancelReason } : {}),
    });
  }

  if (nextStatus === "cancelled" && actor === "SYSTEM" && systemPurpose === "accept_timeout") {
    if (statusEv.ok && statusEv.inserted) {
      await notifyStoreOwnerAcceptTimeoutCancelled(sb, {
        storeId: sid,
        orderId: oid,
        orderNo,
        storeOrderEventId: statusEv.row.id,
      });
    } else if (!statusEv.ok) {
      await notifyStoreOwnerAcceptTimeoutCancelled(sb, { storeId: sid, orderId: oid, orderNo });
    }
  }

  try {
    await appendStoreOrderMessengerStatusTransition(
      sb as import("@supabase/supabase-js").SupabaseClient<any>,
      oid,
      current,
      nextStatus,
      actor
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

  // NTF-04: drop the shared snapshot rows before responding so no instance serves the old status.
  await purgeStoreOrderDetailSnapshotRows(sb, oid);
  invalidateStoreOrderDetailSnapshot(oid, buyerId || undefined, `status_${nextStatus}`);
  invalidateBuyerStoreOrdersListSnapshot(buyerId || undefined, `status_${nextStatus}`);

  return { ok: true, order_status: nextStatus, previous: current };
}
