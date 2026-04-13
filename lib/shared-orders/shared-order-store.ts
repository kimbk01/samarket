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
  if (cur === next) return "동일한 상태입니다.";
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
    return `정상 흐름에서 ${cur} → ${next} 는 허용되지 않습니다. 강제 변경과 사유를 사용하세요.`;
  }
  if (!delivery && next === "delivering") {
    return "포장 주문에는 배달중이 없습니다.";
  }
  if (!delivery && next === "arrived") {
    return "포장 주문에는 배송지 도착 단계가 없습니다.";
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
  if (!o) return { ok: false, error: "주문 없음" };
  const e = assertStore(o);
  if (e) return { ok: false, error: e };
  if (o.order_status !== "pending") return { ok: false, error: "신규 주문만 수락할 수 있습니다." };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "accepted";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "accepted",
    from_status: from,
    to_status: "accepted",
    message: "매장에서 주문을 확인했어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_accepted" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerReject(orderId: string, reason: string): { ok: true } | { ok: false; error: string } {
  if (!reason.trim()) return { ok: false, error: "사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  const e = assertStore(o);
  if (e) return { ok: false, error: e };
  if (o.order_status !== "pending" && o.order_status !== "accepted") {
    return { ok: false, error: "조리 시작 후에는 거절 대신 관리자·문제 처리를 이용해 주세요." };
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
    message: `매장 거절: ${reason.trim()}`,
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_rejected", reason: reason.trim() });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerStartPreparing(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "accepted") return { ok: false, error: "접수 완료 주문만 조리중으로 바꿀 수 있습니다." };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "preparing";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "preparing",
    from_status: from,
    to_status: "preparing",
    message: "음식을 준비하고 있어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_preparing" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerStartDelivery(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type !== "delivery") return { ok: false, error: "배달 주문만 가능합니다." };
  if (o.order_status !== "ready_for_pickup") {
    return { ok: false, error: "픽업·출고 준비 단계인 주문만 배송중으로 넘길 수 있습니다." };
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
    message: "배달이 출발했어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_delivering" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkPickupReady(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "preparing") return { ok: false, error: "상품준비 전 단계에서만 픽업 준비로 넘길 수 있습니다." };
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "ready_for_pickup";
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "ready_for_pickup",
    from_status: from,
    to_status: "ready_for_pickup",
    message: "픽업할 수 있어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_ready_for_pickup" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkArrived(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type !== "delivery") return { ok: false, error: "배달 주문만 가능합니다." };
  if (o.order_status !== "delivering") {
    return { ok: false, error: "배송중인 주문만 배송지 도착으로 넘길 수 있습니다." };
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
    message: "배송지에 도착했어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_arrived" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerComplete(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_type === "delivery" && o.order_status !== "arrived") {
    return { ok: false, error: "배송지 도착 단계에서만 주문완료 처리할 수 있습니다." };
  }
  if (o.order_type === "pickup" && o.order_status !== "ready_for_pickup") {
    return { ok: false, error: "픽업 준비 단계에서만 완료 처리할 수 있습니다." };
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
    message: "주문이 완료되었어요",
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "owner_completed" });
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerAcknowledgeCancel(orderId: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  if (o.order_status !== "cancel_requested") return { ok: false, error: "취소 요청이 없습니다." };
  const prev = o.order_status;
  appendLog(o, {
    actor_type: "owner",
    actor_name: o.owner_name,
    action_type: "cancel_requested",
    from_status: o.order_status,
    to_status: o.order_status,
    message: "매장에서 취소 요청을 확인했습니다. 관리자 승인을 기다립니다.",
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedOwnerMarkProblem(orderId: string, memo: string): { ok: true } | { ok: false; error: string } {
  if (!memo.trim()) return { ok: false, error: "메모가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (assertStore(o)) return { ok: false, error: assertStore(o)! };
  const allowed = ["preparing", "delivering", "ready_for_pickup", "arrived"];
  if (!allowed.includes(o.order_status)) return { ok: false, error: "조리 이후만 문제 접수가 가능합니다." };
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
    message: `문제·환불 검토 요청: ${memo}`,
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
  if (!reason.trim()) return { ok: false, error: "사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문을 찾을 수 없어요." };
  if (o.buyer_user_id !== buyerUserId) return { ok: false, error: "본인 주문이 아닙니다." };
  if (o.order_status !== "pending" && o.order_status !== "accepted") {
    return { ok: false, error: "지금 단계에서는 취소 요청을 할 수 없어요." };
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
    message: "취소 요청이 접수되었어요",
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
  if (!reason.trim()) return { ok: false, error: "사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (o.buyer_user_id !== buyerUserId) return { ok: false, error: "본인 주문이 아닙니다." };
  const allowed = ["preparing", "delivering", "ready_for_pickup", "arrived", "completed"];
  if (!allowed.includes(o.order_status)) return { ok: false, error: "이 단계에서는 환불 요청이 제한될 수 있어요." };
  if (o.order_status === "refund_requested") return { ok: false, error: "이미 환불 요청이 있어요." };
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
    o.settlement.hold_reason = "회원 환불 요청";
  }
  appendLog(o, {
    actor_type: "member",
    actor_name: o.buyer_name,
    action_type: "refund_requested",
    from_status: from,
    to_status: "refund_requested",
    message: "환불 요청이 접수되었어요",
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
  if (!o) return { ok: false, error: "주문 없음" };
  const err = validateSharedOrderTransition(o, next, opts.force);
  if (err) return { ok: false, error: err };
  if (opts.force && !opts.reason?.trim()) return { ok: false, error: "강제 변경 시 사유가 필요합니다." };
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
    actor_name: "운영 관리자",
    action_type: "admin_force_status",
    from_status: from,
    to_status: next,
    message: opts.force ? `관리자 강제 변경: ${opts.reason ?? ""}` : `상태 변경: ${from} → ${next}`,
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
  if (!o) return { ok: false, error: "주문 없음" };
  if (o.order_status !== "cancel_requested" || o.cancel_request_status !== "pending") {
    return { ok: false, error: "대기 중인 취소 요청이 없습니다." };
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
    actor_name: "운영 관리자",
    action_type: "cancel_approved",
    from_status: from,
    to_status: "cancelled",
    message: "취소 요청이 승인되었어요",
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
  if (!memo.trim()) return { ok: false, error: "거절 사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  if (o.order_status !== "cancel_requested" || o.cancel_request_status !== "pending") {
    return { ok: false, error: "대기 중인 취소 요청이 없습니다." };
  }
  const prev = o.order_status;
  const from = o.order_status;
  o.order_status = "accepted";
  o.cancel_request_status = "rejected";
  o.admin_memo = memo.trim();
  appendLog(o, {
    actor_type: "admin",
    actor_name: "운영 관리자",
    action_type: "cancel_rejected",
    from_status: from,
    to_status: "accepted",
    message: `취소 요청 거절: ${memo.trim()}`,
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
  if (!memo.trim()) return { ok: false, error: "승인 메모가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
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
    actor_name: "운영 관리자",
    action_type: "refund_approved",
    from_status: from,
    to_status: "refunded",
    message: "환불이 승인되었어요",
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
  if (!memo.trim()) return { ok: false, error: "거절 사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
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
    actor_name: "운영 관리자",
    action_type: "refund_rejected",
    from_status: from,
    to_status: "preparing",
    message: `환불 거절: ${memo.trim()}`,
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
  if (!reason.trim()) return { ok: false, error: "보류 사유가 필요합니다." };
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
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
    actor_name: "운영 관리자",
    action_type: "settlement_held",
    from_status: o.order_status,
    to_status: o.order_status,
    message: `정산 보류: ${reason}`,
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
  if (!o) return { ok: false, error: "주문 없음" };
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
    actor_name: "운영 관리자",
    action_type: "settlement_released",
    from_status: o.order_status,
    to_status: o.order_status,
    message: "정산 보류가 해제되었어요",
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
  if (!o) return { ok: false, error: "주문 없음" };
  const prev = o.order_status;
  o.settlement_status = "paid";
  if (o.settlement) {
    o.settlement.settlement_status = "paid";
    o.settlement.paid_at = nowIso();
  }
  if (memo.trim()) o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: "운영 관리자",
    action_type: "settlement_paid",
    from_status: o.order_status,
    to_status: o.order_status,
    message: "정산 완료 처리",
  });
  touch(o);
  bump();
  afterSharedOrderMutation(o, prev);
  return { ok: true };
}

export function sharedAdminSetMemo(orderId: string, memo: string): { ok: true } | { ok: false; error: string } {
  const o = findSharedOrder(orderId);
  if (!o) return { ok: false, error: "주문 없음" };
  o.admin_memo = memo;
  appendLog(o, {
    actor_type: "admin",
    actor_name: "운영 관리자",
    action_type: "admin_memo",
    from_status: o.order_status,
    to_status: o.order_status,
    message: `메모: ${memo.slice(0, 120)}`,
  });
  touch(o);
  bump();
  emitOrderNotifications(o, { kind: "admin_memo", memo: memo });
  afterSharedOrderMutation(o, o.order_status);
  return { ok: true };
}

