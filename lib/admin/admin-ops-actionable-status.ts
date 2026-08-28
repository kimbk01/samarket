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
