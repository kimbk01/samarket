/**
 * DIBAY DATA RESET — Order hard-delete boundary (B2).
 * Aligns with ORDER_ENTITY_ACTION_POLICY.hardDeleteAvailable = false.
 * Status list from lib/stores/order-status-transitions (SSOT).
 */

import {
  STORE_ORDER_STATUS_LIST,
  type StoreOrderStatus,
} from "@/lib/stores/order-status-transitions";

export type OrderHardDeleteDisposition = "DELETE_SAFE" | "ARCHIVE_ONLY" | "PRESERVE";

/**
 * Default Domain Reset / Admin hard wipe dispositions by order_status.
 * No status is DELETE_SAFE while Gift/Finance FKs may attach — preserve all history.
 */
export const ORDER_HARD_DELETE_BY_STATUS: Record<StoreOrderStatus, OrderHardDeleteDisposition> =
  {
    pending: "PRESERVE",
    accepted: "PRESERVE",
    preparing: "PRESERVE",
    ready_for_pickup: "PRESERVE",
    delivering: "PRESERVE",
    arrived: "PRESERVE",
    completed: "PRESERVE",
    cancel_requested: "PRESERVE",
    cancelled: "PRESERVE",
    refund_requested: "PRESERVE",
    refunded: "PRESERVE",
  };

export const ORDER_HARD_DELETE_BLOCKED = true as const;

export const ORDER_HARD_DELETE_BLOCK_REASON =
  "order_hard_delete_blocked_finance_gift_boundary" as const;

export function orderHardDeleteDisposition(status: string): OrderHardDeleteDisposition {
  const s = status.trim() as StoreOrderStatus;
  if ((STORE_ORDER_STATUS_LIST as readonly string[]).includes(s)) {
    return ORDER_HARD_DELETE_BY_STATUS[s];
  }
  return "PRESERVE";
}

export function isOrderHardDeleteAllowed(_status?: string): boolean {
  void _status;
  return !ORDER_HARD_DELETE_BLOCKED;
}
