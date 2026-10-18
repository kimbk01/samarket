/**
 * P0-D — ADMIN_Q actionable status SSOT (next-action owner proven).
 *
 * NOT the same as display/KPI pending families (e.g. BUSINESS_OPS_PENDING_APPROVAL).
 * ADMIN_Q = Admin is the next actor on the workload.
 */

/** New apply + admin actively reviewing — NOT revision_requested (Owner waits). */
export const ADMIN_ACTIONABLE_STORE_APPROVAL = ["pending", "under_review"] as const;

/** Trade reports — admin must act (aligned with admin dashboard aggregate RPC). */
export const TRADE_REPORT_ADMIN_ACTIONABLE = ["pending", "reviewing"] as const;

export const STORE_REPORT_ADMIN_ACTIONABLE = ["open"] as const;

export const COMMUNITY_REPORT_ADMIN_ACTIONABLE = ["open", "reviewing"] as const;

/**
 * Store settlement rows the admin must still pay out (scheduled → processing → paid; held = admin decision).
 * Same set as the settlements list `unpaid_only=1` filter.
 */
export const SETTLEMENT_ADMIN_ACTIONABLE_STATUSES = ["scheduled", "processing", "held"] as const;

/** Closed store orders — never Admin Q workload, whatever flags remain on the row. */
export const STORE_ORDER_CLOSED_STATUSES = ["completed", "cancelled", "refunded"] as const;

/**
 * Store order request statuses decided by the STORE OWNER (3단계, docs/store-order-cancel-refund-decision-ssot.md):
 * cancel_requested → approve (cancelled) / reject (restore); refund_requested → refunded / reject.
 * Owner work — never Admin Q workload (the admin may still intervene from the order detail).
 */
export const STORE_ORDER_OWNER_DECISION_STATUSES = ["cancel_requested", "refund_requested"] as const;

/** Statuses excluded from the Admin Q order queue whatever flags remain on the row: closed + owner decisions. */
export const STORE_ORDER_ADMIN_QUEUE_EXCLUDED_STATUSES = [
  ...STORE_ORDER_CLOSED_STATUSES,
  ...STORE_ORDER_OWNER_DECISION_STATUSES,
] as const;

export function isAdminActionableStoreApproval(status: string): boolean {
  return (ADMIN_ACTIONABLE_STORE_APPROVAL as readonly string[]).includes(String(status ?? "").trim());
}

export function isAdminActionableTradeReport(status: string): boolean {
  return (TRADE_REPORT_ADMIN_ACTIONABLE as readonly string[]).includes(String(status ?? "").trim());
}

export function isAdminActionableStoreReport(status: string): boolean {
  return (STORE_REPORT_ADMIN_ACTIONABLE as readonly string[]).includes(String(status ?? "").trim());
}

export function isAdminActionableCommunityReport(status: string): boolean {
  return (COMMUNITY_REPORT_ADMIN_ACTIONABLE as readonly string[]).includes(String(status ?? "").trim());
}
