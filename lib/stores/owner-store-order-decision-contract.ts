/**
 * Store owner decisions on requests for its own orders (3단계 — the store runs the order).
 * Server: lib/stores/owner-store-order-decision.ts · POST /api/me/stores/[storeId]/orders/[orderId]/decide
 *
 * - cancel_requested (buyer request, or a legacy owner request from before 3단계): approve → cancelled,
 *   reject → the status recorded on the request row (`previous_order_status`).
 * - refund_requested: approve → refunded (atomic refund RPC), reject → the status recorded right before
 *   the request (same unambiguous-evidence rule as the admin path).
 * Rejections always carry a reason (shown to the buyer). Commission follows the DB trigger only.
 */
import {
  ADMIN_INTERVENTION_REASON_MAX,
  normalizeAdminInterventionReason,
} from "@/lib/admin/store-orders/admin-store-order-intervention-contract";

export type OwnerStoreOrderDecisionAction =
  | "cancel_request_approve"
  | "cancel_request_reject"
  | "refund_approve"
  | "refund_reject";

export const OWNER_STORE_ORDER_DECISION_ACTIONS: readonly OwnerStoreOrderDecisionAction[] = [
  "cancel_request_approve",
  "cancel_request_reject",
  "refund_approve",
  "refund_reject",
] as const;

export const OWNER_DECISION_REASON_MAX = ADMIN_INTERVENTION_REASON_MAX;

export function isOwnerStoreOrderDecisionAction(v: unknown): v is OwnerStoreOrderDecisionAction {
  return typeof v === "string" && (OWNER_STORE_ORDER_DECISION_ACTIONS as readonly string[]).includes(v);
}

/** Reject actions need a reason (2–500 chars, same rule as admin intervention). */
export function ownerDecisionNeedsReason(action: OwnerStoreOrderDecisionAction): boolean {
  return action === "cancel_request_reject" || action === "refund_reject";
}

export const normalizeOwnerDecisionReason = normalizeAdminInterventionReason;

/** Decisions available for the current order status. */
export function ownerStoreOrderDecisionActions(orderStatus: string): OwnerStoreOrderDecisionAction[] {
  if (orderStatus === "cancel_requested") return ["cancel_request_approve", "cancel_request_reject"];
  if (orderStatus === "refund_requested") return ["refund_approve", "refund_reject"];
  return [];
}
