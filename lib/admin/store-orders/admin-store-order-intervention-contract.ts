/**
 * Admin intervention on a store order — single contract for the order detail
 * 「관리자 개입」 panel and `POST /api/admin/store-orders/[orderId]/intervene`.
 * Doc: docs/admin-store-orders-read-ssot.md §5
 *
 * The store owner runs the order; these are exception paths. Every action needs a
 * reason, is re-checked on the server against the status the admin saw, and goes
 * through `applyStoreOrderStatusTransition` (ADMIN graph, CAS). Allowed actions are
 * derived from the ADMIN transition graph — never listed separately.
 */
import { allowedOrderTransitionsForActor } from "@/lib/stores/order-status-transitions";

export type AdminStoreOrderInterventionAction =
  | "cancel_request_approve"
  | "cancel_request_reject"
  | "refund_approve"
  | "refund_reject"
  | "force_cancel"
  | "refund_request_create";

export const ADMIN_STORE_ORDER_INTERVENTION_ACTIONS: readonly AdminStoreOrderInterventionAction[] = [
  "cancel_request_approve",
  "cancel_request_reject",
  "refund_approve",
  "refund_reject",
  "force_cancel",
  "refund_request_create",
] as const;

export const ADMIN_INTERVENTION_REASON_MIN = 2;
export const ADMIN_INTERVENTION_REASON_MAX = 500;

export function isAdminStoreOrderInterventionAction(v: unknown): v is AdminStoreOrderInterventionAction {
  return typeof v === "string" && (ADMIN_STORE_ORDER_INTERVENTION_ACTIONS as readonly string[]).includes(v);
}

/** Trimmed reason, or the validation error code. */
export function normalizeAdminInterventionReason(
  raw: unknown
): { ok: true; reason: string } | { ok: false; error: "reason_required" | "reason_too_long" } {
  const reason = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (reason.length < ADMIN_INTERVENTION_REASON_MIN) return { ok: false, error: "reason_required" };
  if (reason.length > ADMIN_INTERVENTION_REASON_MAX) return { ok: false, error: "reason_too_long" };
  return { ok: true, reason };
}

/** Actions available for the current order (ADMIN graph). Terminal statuses → none. */
export function adminStoreOrderInterventionActions(
  orderStatus: string,
  paymentStatus: string
): AdminStoreOrderInterventionAction[] {
  if (orderStatus === "cancel_requested") return ["cancel_request_approve", "cancel_request_reject"];
  if (orderStatus === "refund_requested") return ["refund_approve", "refund_reject"];
  const next = allowedOrderTransitionsForActor("ADMIN", orderStatus, "", { paymentStatus });
  const out: AdminStoreOrderInterventionAction[] = [];
  // Completed orders are refunded, not cancelled (adminForceCancelStoreOrder refuses them).
  if (next.includes("cancelled") && orderStatus !== "completed") out.push("force_cancel");
  if (next.includes("refund_requested")) out.push("refund_request_create");
  return out;
}

export const ADMIN_STORE_ORDER_INTERVENTION_LABEL: Record<
  AdminStoreOrderInterventionAction,
  { ko: string; en: string; confirmKo: string; confirmEn: string; destructive: boolean }
> = {
  cancel_request_approve: {
    ko: "취소 요청 승인",
    en: "Approve cancel request",
    confirmKo: "주문이 취소되고 재고·상품권·쿠폰이 복원됩니다. 조리 이후 취소면 수수료는 정산 검토로 넘어갑니다.",
    confirmEn: "The order is cancelled and stock, gift and coupons are restored. A post-cooking cancel sends the fee to settlement review.",
    destructive: true,
  },
  cancel_request_reject: {
    ko: "취소 요청 반려",
    en: "Reject cancel request",
    confirmKo: "요청 직전 상태로 되돌립니다. 조리 단계로 돌아가면 그 시점에 수수료가 부과됩니다.",
    confirmEn: "Restores the status before the request. Returning to a cooking status charges the commission then.",
    destructive: false,
  },
  refund_approve: {
    ko: "환불 승인",
    en: "Approve refund",
    confirmKo: "주문이 환불 완료로 바뀌고 상품권·재고가 복원됩니다. 수수료는 정산 검토로 넘어갑니다.",
    confirmEn: "The order becomes refunded and gift/stock are restored. The fee goes to settlement review.",
    destructive: true,
  },
  refund_reject: {
    ko: "환불 반려",
    en: "Reject refund",
    confirmKo: "환불 요청 직전 상태(서버 기록 기준)로 되돌립니다. 돈의 이동은 없습니다.",
    confirmEn: "Restores the status recorded before the refund request. No money moves.",
    destructive: false,
  },
  force_cancel: {
    ko: "관리자 취소",
    en: "Cancel order (admin)",
    confirmKo: "매장 결정 없이 주문을 취소합니다. 예외 상황에서만 사용하세요.",
    confirmEn: "Cancels the order without the store's decision. Exceptions only.",
    destructive: true,
  },
  refund_request_create: {
    ko: "환불 요청 생성",
    en: "Open refund request",
    confirmKo: "주문을 환불 요청 상태로 바꿉니다. 승인·반려는 별도로 결정합니다.",
    confirmEn: "Moves the order to refund requested. Approval is a separate decision.",
    destructive: false,
  },
};

export const ADMIN_STORE_ORDER_INTERVENTION_ERROR: Record<string, { ko: string; en: string }> = {
  reason_required: { ko: "사유를 2자 이상 입력하세요.", en: "Enter a reason (2+ characters)." },
  reason_too_long: { ko: "사유는 500자 이하로 입력하세요.", en: "Reason must be 500 characters or fewer." },
  status_changed: {
    ko: "그 사이 주문 상태가 바뀌었습니다. 최신 상태로 다시 불러옵니다.",
    en: "The order status changed meanwhile. Reloading the latest state.",
  },
  transition_conflict: {
    ko: "동시에 다른 처리가 반영됐습니다. 최신 상태로 다시 불러옵니다.",
    en: "Another change landed at the same time. Reloading.",
  },
  action_not_allowed_for_status: {
    ko: "현재 상태에서는 할 수 없는 처리입니다.",
    en: "Not allowed for the current status.",
  },
  refund_restore_status_unknown: {
    ko: "환불 요청 직전 상태를 확인할 수 없어 반려할 수 없습니다. 취소 또는 환불 승인으로 처리하세요.",
    en: "The status before the refund request is unknown, so it cannot be rejected.",
  },
  cancel_request_not_found: { ko: "대기 중인 취소 요청이 없습니다.", en: "No pending cancel request." },
  order_not_found: { ko: "주문을 찾을 수 없습니다.", en: "Order not found." },
};
