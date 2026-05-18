import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { afterSharedOrderMutation, resetSharedOrderChat } from "@/lib/shared-order-chat/order-chat-sync";
import { emitOrderNotifications } from "@/lib/shared-notifications/order-notification-emit";
import { resetSharedNotifications } from "@/lib/shared-notifications/shared-notification-store";
import { buildSharedLog } from "./order-log-utils";
import type {
  SharedActorType,
  SharedOrder,
  SharedOrderStatus,
  SharedPaymentStatus,
  SharedSettlementStatus,
} from "./types";

function soT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

let orders: SharedOrder[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function subscribeSharedOrders(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSharedOrdersVersion() {
  return version;
}

function bump() {
  version++;
  listeners.forEach((l) => l());
}

/** 신고 등 부가 데이터만 바뀔 때 UI 갱신용 */
export function notifySharedOrdersChanged() {
  bump();
}

function nowIso() {
  return new Date().toISOString();
}

export function findSharedOrder(ref: string): SharedOrder | undefined {
  return orders.find((o) => o.id === ref || o.order_no === ref);
}

export function listSharedOrdersRaw(): SharedOrder[] {
  return orders.map(clone);
}

export function resetSharedOrders() {
  orders = [];
  resetSharedNotifications();
  resetSharedOrderChat();
  bump();
}

function touch(o: SharedOrder) {
  o.updated_at = nowIso();
}

function appendLog(
  o: SharedOrder,
  p: {
    actor_type: SharedActorType;
    actor_name: string;
    action_type: import("./types").SharedActionType;
    from_status: SharedOrderStatus | null;
    to_status: SharedOrderStatus | null;
    message: string;
  }
) {
  o.logs.push(
    buildSharedLog({
      order_id: o.id,
      ...p,
    })
  );
}

function ensureSettlementScheduled(o: SharedOrder) {
  if (o.order_status !== "completed" || o.payment_status !== "paid") return;
  if (o.settlement_status === "cancelled") return;
  const fee = Math.round(o.final_amount * 0.1);
  const net = o.final_amount - fee;
  if (!o.settlement) {
    o.settlement = {
      id: `st-${o.id}`,
      gross_amount: o.final_amount,
      fee_amount: fee,
      settlement_amount: net,
      settlement_status: "scheduled",
      scheduled_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    };
  } else {
    o.settlement.gross_amount = o.final_amount;
    o.settlement.fee_amount = fee;
    o.settlement.settlement_amount = net;
    o.settlement.settlement_status = "scheduled";
  }
  o.settlement_status = "scheduled";
}

/** 관리자용 정상 흐름 검증 (강제 시 스킵) */
export function validateSharedOrderTransition(
  o: SharedOrder,
  next: SharedOrderStatus,
  force: boolean
): string | null {
  if (force) return null;
  const cur = o.order_status;
  if (cur === next) return soT("shared_order_same_status");
  const delivery = o.order_type === "delivery";

  const allowed: Partial<Record<SharedOrderStatus, SharedOrderStatus[]>> = {
    pending: ["accepted", "cancelled", "cancel_requested"],
    accepted: ["preparing", "cancelled", "cancel_requested"],
    preparing: ["ready_for_pickup", "refund_requested", "cancelled"],
    ready_for_pickup: delivery
      ? ["delivering", "refund_requested", "cancelled"]
      : ["completed", "refund_requested", "cancelled"],
    delivering: ["arrived", "refund_requested", "cancelled"],
    arrived: ["completed", "refund_requested", "cancelled"],
    completed: [],
    cancelled: [],
    cancel_requested: [],
    refund_requested: ["refunded", "cancelled", "preparing", "accepted"],
    refunded: [],
  };

  const list = allowed[cur] ?? [];
  if (!list.includes(next)) {
    return soT("shared_order_transition_invalid", { from: cur, to: next });
  }
  if (!delivery && next === "delivering") {
    return soT("shared_order_pickup_no_delivering");
  }
  if (!delivery && next === "arrived") {
    return soT("shared_order_pickup_no_arrived");
  }
  return null;
}

/** 레거시 인메모리 주문 스토어는 비어 있으며, 실 주문은 Supabase/API를 사용합니다. */
function assertStore(_o: SharedOrder) {
  return null;
}

// ——— 오너 ———

export function sharedOwnerAccept(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const e = assertStore(o);
  if (e) return { ok: false, error: e };
  if (o.order_status !== "pending") return { ok: false, error: soT("shared_order_accept_pending_only") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "accepted";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "accepted",
    from_status: from,
    to_status: "accepted",
    message: soT("shared_order_log_owner_accepted"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_accepted" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerReject(orderId: string, reason: string): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) return { ok: false, error: soT("shared_order_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const e = assertStore(o);
  if (e) return { ok: false, error: e };
  if (o.order_status !== "pending" && o.order_status !== "accepted") {
    return { ok: false, error: soT("shared_order_reject_after_prep") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "cancelled";
  o.payment_status = o.payment_status === "paid" ? "refunded" : "cancelled";
  o.settlement_status = "cancelled";
  o.cancel_reason = reason.trim();
  if (o.settlement) o.settlement.settlement_status = "cancelled";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "owner_rejected",
    from_status: from,
    to_status: "cancelled",
    message: soT("shared_order_log_owner_rejected", { reason: reason.trim() }),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_rejected", reason: reason.trim() });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerStartPreparing(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "accepted") return { ok: false, error: soT("shared_order_preparing_accepted_only") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "preparing";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "preparing",
    from_status: from,
    to_status: "preparing",
    message: soT("shared_order_log_preparing"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_preparing" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerStartDelivery(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type !== "delivery") return { ok: false, error: soT("shared_order_delivery_only") };
  if (o.order_status !== "ready_for_pickup") {
    return { ok: false, error: soT("shared_order_delivering_ready_only") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "delivering";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "delivering",
    from_status: from,
    to_status: "delivering",
    message: soT("shared_order_log_delivering"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_delivering" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkPickupReady(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "preparing") return { ok: false, error: soT("shared_order_pickup_ready_preparing_only") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "ready_for_pickup";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "ready_for_pickup",
    from_status: from,
    to_status: "ready_for_pickup",
    message: soT("shared_order_log_pickup_ready"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_ready_for_pickup" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkArrived(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type !== "delivery") return { ok: false, error: soT("shared_order_delivery_only") };
  if (o.order_status !== "delivering") {
    return { ok: false, error: soT("shared_order_arrived_delivering_only") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "arrived";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "arrived",
    from_status: from,
    to_status: "arrived",
    message: soT("shared_order_log_arrived"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_arrived" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerComplete(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type === "delivery" && o.order_status !== "arrived") {
    return { ok: false, error: soT("shared_order_complete_arrived_only") };
  }
  if (o.order_type === "pickup" && o.order_status !== "ready_for_pickup") {
    return { ok: false, error: soT("shared_order_complete_pickup_ready_only") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "completed";
  ensureSettlementScheduled(o);
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "completed",
    from_status: from,
    to_status: "completed",
    message: soT("shared_order_log_completed"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_completed" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerAcknowledgeCancel(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "cancel_requested") return { ok: false, error: soT("shared_order_no_cancel_request") };
  const prev = o.order_status;
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "cancel_requested",
    from_status: o.order_status,
    to_status: o.order_status,
    message: soT("shared_order_log_cancel_ack"),
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkProblem(orderId: string, memo: string): { ok: true } | { ok: false; error: string } {
  if (!memo.trim()) return { ok: false, error: soT("shared_order_memo_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  const allowed = ["preparing", "delivering", "ready_for_pickup", "arrived"];
  if (!allowed.includes(o.order_status)) return { ok: false, error: soT("shared_order_problem_after_prep") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "refund_requested";
  o.refund_request = {
    reason: memo,
    requested_by: "owner",
    requested_at: nowIso(),
    status: "pending",
  };
  o.settlement_status = "held";
  if (o.settlement) {
    o.settlement.settlement_status = "held";
    o.settlement.hold_reason = memo;
  }
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "refund_requested",
    from_status: from,
    to_status: "refund_requested",
    message: soT("shared_order_log_refund_problem", { memo }),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_refund_problem" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

// ——— 회원 ———

export function sharedMemberRequestCancel(
  orderId: string,
  buyerUserId: string,
  reason: string
): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) return { ok: false, error: soT("shared_order_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_member_not_found") };
  if (o.buyer_user_id !== buyerUserId) return { ok: false, error: soT("shared_order_not_your_order") };
  if (o.order_status !== "pending" && o.order_status !== "accepted") {
    return { ok: false, error: soT("shared_order_cancel_stage_blocked") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "cancel_requested";
  o.cancel_request_status = "pending";
  o.cancel_request_reason = reason.trim();
  appendLog(o, {
    actor_type: "member",
    actor_name: o.buyer_name,
    action_type: "cancel_requested",
    from_status: from,
    to_status: "cancel_requested",
    message: soT("shared_order_log_cancel_requested"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "member_cancel_requested" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedMemberRequestRefund(
  orderId: string,
  buyerUserId: string,
  reason: string
): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) return { ok: false, error: soT("shared_order_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (o.buyer_user_id !== buyerUserId) return { ok: false, error: soT("shared_order_not_your_order") };
  const allowed = ["preparing", "delivering", "ready_for_pickup", "arrived", "completed"];
  if (!allowed.includes(o.order_status)) return { ok: false, error: soT("shared_order_refund_stage_blocked") };
  if (o.order_status === "refund_requested") return { ok: false, error: soT("shared_order_refund_already") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "refund_requested";
  o.refund_request = {
    reason: reason.trim(),
    requested_by: "member",
    requested_at: nowIso(),
    status: "pending",
  };
  o.settlement_status = "held";
  if (o.settlement) {
    o.settlement.settlement_status = "held";
    o.settlement.hold_reason = soT("shared_order_hold_member_refund");
  }
  appendLog(o, {
    actor_type: "member",
    actor_name: o.buyer_name,
    action_type: "refund_requested",
    from_status: from,
    to_status: "refund_requested",
    message: soT("shared_order_log_refund_requested"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "member_refund_requested" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

// ——— 관리자 ———

export function sharedAdminSetOrderStatus(
  orderId: string,
  next: SharedOrderStatus,
  opts: {
    force: boolean;
    reason?: string;
    paymentStatus?: SharedPaymentStatus;
    settlementStatus?: SharedSettlementStatus;
    adminAction?: import("./types").SharedAdminActionStatus;
  }
): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const err = validateSharedOrderTransition(o, next, opts.force);
  if (err) return { ok: false, error: err };
  if (opts.force && !opts.reason?.trim()) return { ok: false, error: soT("shared_order_force_reason_required") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = next;
  if (opts.paymentStatus) o.payment_status = opts.paymentStatus;
  if (opts.settlementStatus) o.settlement_status = opts.settlementStatus;
  if (opts.adminAction) o.admin_action_status = opts.adminAction;
  if (o.settlement && opts.settlementStatus) {
    o.settlement.settlement_status = opts.settlementStatus;
    if (opts.settlementStatus === "held" && opts.reason) o.settlement.hold_reason = opts.reason;
    if (opts.settlementStatus !== "held") o.settlement.hold_reason = undefined;
  }
  if (next === "completed" && o.payment_status === "paid") ensureSettlementScheduled(o);
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "admin_force_status",
    from_status: from,
    to_status: next,
    message: opts.force ? soT("shared_order_log_admin_force", { reason: opts.reason ?? "" }) : soT("shared_order_log_status_change", { from, to: next }),
  });
  touch(o);
  bump();
  if (opts.force && next === "cancelled") {
    emitOrderNotifications(o, { kind: "admin_forced_cancel", reason: opts.reason });
  } else if (opts.force) {
    emitOrderNotifications(o, { kind: "admin_forced_review", reason: opts.reason });
  }
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminApproveCancel(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (o.order_status !== "cancel_requested" || o.cancel_request_status !== "pending") {
    return { ok: false, error: soT("shared_order_no_pending_cancel") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "cancelled";
  o.cancel_request_status = "approved";
  o.payment_status = o.payment_status === "paid" ? "refunded" : "cancelled";
  o.settlement_status = "cancelled";
  o.admin_action_status = "admin_cancelled";
  if (o.settlement) o.settlement.settlement_status = "cancelled";
  if (memo.trim()) o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "cancel_approved",
    from_status: from,
    to_status: "cancelled",
    message: soT("shared_order_log_cancel_approved"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_cancel_approved" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminRejectCancel(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  if (!memo.trim()) return { ok: false, error: soT("shared_order_reject_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (o.order_status !== "cancel_requested" || o.cancel_request_status !== "pending") {
    return { ok: false, error: soT("shared_order_no_pending_cancel") };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "accepted";
  o.cancel_request_status = "rejected";
  o.admin_memo = memo.trim();
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "cancel_rejected",
    from_status: from,
    to_status: "accepted",
    message: soT("shared_order_log_cancel_rejected", { memo: memo.trim() }),
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminApproveRefund(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  if (!memo.trim()) return { ok: false, error: soT("shared_order_approve_memo_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "refunded";
  o.payment_status = "refunded";
  o.settlement_status = "cancelled";
  o.admin_action_status = "refund_approved";
  if (o.refund_request) o.refund_request.status = "approved";
  if (o.settlement) o.settlement.settlement_status = "cancelled";
  o.admin_memo = memo.trim();
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "refund_approved",
    from_status: from,
    to_status: "refunded",
    message: soT("shared_order_log_refund_approved"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_refund_approved" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminRejectRefund(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  if (!memo.trim()) return { ok: false, error: soT("shared_order_reject_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  if (o.refund_request) o.refund_request.status = "rejected";
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "preparing";
  o.admin_action_status = "refund_rejected";
  o.admin_memo = memo.trim();
  if (o.settlement?.settlement_status === "held") {
    o.settlement.settlement_status = "scheduled";
    o.settlement.hold_reason = undefined;
  }
  o.settlement_status = "scheduled";
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "refund_rejected",
    from_status: from,
    to_status: "preparing",
    message: soT("shared_order_log_refund_rejected", { memo: memo.trim() }),
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminHoldSettlement(
  orderId: string,
  reason: string
): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) return { ok: false, error: soT("shared_order_hold_reason_required") };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const prev = o.order_status;
  if (!o.settlement) {
    const fee = Math.round(o.final_amount * 0.1);
    o.settlement = {
      id: `st-${o.id}`,
      gross_amount: o.final_amount,
      fee_amount: fee,
      settlement_amount: o.final_amount - fee,
      settlement_status: "held",
      hold_reason: reason,
    };
  }
  o.settlement_status = "held";
  o.admin_action_status = "manual_hold";
  if (o.settlement) {
    o.settlement.settlement_status = "held";
    o.settlement.hold_reason = reason;
  }
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "settlement_held",
    from_status: o.order_status,
    to_status: o.order_status,
    message: soT("shared_order_log_settlement_hold", { reason }),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_hold_settlement", reason: reason.trim() });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminReleaseSettlement(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const prev = o.order_status;
  o.settlement_status = "scheduled";
  o.admin_action_status = "none";
  if (o.settlement) {
    o.settlement.settlement_status = "scheduled";
    o.settlement.hold_reason = undefined;
  }
  if (memo.trim()) o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "settlement_released",
    from_status: o.order_status,
    to_status: o.order_status,
    message: soT("shared_order_log_settlement_released"),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_release_settlement" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminMarkSettlementPaid(
  orderId: string,
  memo: string
): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  const prev = o.order_status;
  o.settlement_status = "paid";
  if (o.settlement) {
    o.settlement.settlement_status = "paid";
    o.settlement.paid_at = nowIso();
  }
  if (memo.trim()) o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "settlement_paid",
    from_status: o.order_status,
    to_status: o.order_status,
    message: soT("shared_order_log_settlement_paid"),
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminSetMemo(orderId: string, memo: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: soT("shared_order_not_found") };
  o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: soT("shared_order_admin_actor"),
    action_type: "admin_memo",
    from_status: o.order_status,
    to_status: o.order_status,
    message: soT("shared_order_log_admin_memo", { memo: memo.slice(0, 120) }),
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_memo", memo: memo });
  afterSharedOrderMutation(o, o.order_status);
  return { ok: true };
}

