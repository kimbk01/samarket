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
import { catalogPair } from "@/lib/i18n/catalog-pair";

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
    confirmKo: "주문이 취소되고 재고·상품권·쿠폰이 복원됩니다. 조리 이후 취소면 수수료는 수수료 검토로 넘어갑니다.",
    confirmEn: "The order is cancelled and stock, gift and coupons are restored. A post-cooking cancel sends the fee to commission review.",
    destructive: true,
  },
  cancel_request_reject: {
    ko: "취소 요청 반려",
    en: "Reject cancel request",
    confirmKo: "요청 직전 상태로 되돌립니다. 조리 단계로 돌아가면 그 시점에 수수료가 부과됩니다.",
    confirmEn: "Restores the status before the request. Returning to a cooking status charges the commission then.",
    destructive: false,
  },
  /**
   * DEF-23 / C-9 — 「환불 처리 기록」: customers pay the store directly, so this only records that the
   * store refunded the customer. No platform money moves.
   */
  refund_approve: {
    ko: "환불 처리 기록",
    en: "Record refund",
    confirmKo:
      "고객 결제는 매장에서 직접 처리, 플랫폼 자금 이동 없음. 매장이 고객에게 환불한 사실을 기록하고 주문을 환불 완료로 바꾸며 상품권·재고를 복원합니다. 수수료는 수수료 검토로 넘어갑니다.",
    confirmEn:
      "The customer pays the store directly — no platform money moves. This records that the store refunded the customer, marks the order refunded and restores gift/stock. The fee goes to commission review.",
    destructive: true,
  },
  refund_reject: {
    ko: "환불 반려",
    en: "Reject refund",
    confirmKo: "환불 요청 직전 상태(서버 기록 기준)로 되돌립니다. 플랫폼 자금 이동은 없습니다.",
    confirmEn: "Restores the status recorded before the refund request. No money moves.",
    destructive: false,
  },
  force_cancel: {
    ko: "강제 취소",
    en: "Force cancel",
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
  reason_required: catalogPair("admin_enter_a_reason_2_characters_2"),
  reason_too_long: catalogPair("admin_reason_must_be_500_characters_or"),
  status_changed: catalogPair("admin_the_order_status_changed_meanwhile_reloading"),
  transition_conflict: catalogPair("admin_another_change_landed_at_the_same"),
  action_not_allowed_for_status: catalogPair("admin_not_allowed_for_the_current_status"),
  refund_restore_status_unknown: catalogPair("admin_the_status_before_the_refund_request"),
  cancel_request_not_found: catalogPair("admin_no_pending_cancel_request"),
  order_not_found: catalogPair("admin_do_detail_not_found"),
};
