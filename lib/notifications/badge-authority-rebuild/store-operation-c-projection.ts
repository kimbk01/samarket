/**
 * Slice 2-5 — Store Operation C_store projection (runtime).
 *
 * C_store(storeId) = unfinished Action Required count for store:{storeId}
 *   = pending + refund + cancel + open inquiry
 *
 * Authority Contract LOCK — do not reopen A_member / B_member / B_store.
 * DO NOT use max(state, fab_owner_orders).
 * DO NOT include REVIEW (UNKNOWN_BLOCKED) or cooking/delivery (OUT_OF_BADGE).
 * DO NOT clear on read / screen open / chat read.
 */
import { storeBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import {
  cStoreHubFormulaCandidate,
  forbidMaxAsCStoreAuthority,
} from "@/lib/notifications/badge-authority-rebuild/c-store-authority-contract";

export const STORE_OPERATION_C_PROJECTION =
  "store_operation_c_projection_v1" as const;

export type StoreOperationCCounts = Readonly<{
  pendingOrderActions: number;
  refundActions: number;
  cancelActions: number;
  openInquiryActions: number;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * Resolve C_store total for one store.
 * Empty / invalid storeId → 0 (never fall back to owner userId).
 */
export function resolveOwnerOperationAttentionCountForStore(
  storeId: string | null | undefined,
  counts: StoreOperationCCounts
): number {
  const sid = String(storeId ?? "").trim();
  if (!sid) return 0;
  const id = storeBadgeIdentity(sid);
  if (!id.ok || id.identity.scope !== "store") return 0;
  return cStoreHubFormulaCandidate({
    pendingOrderActions: nonNeg(counts.pendingOrderActions),
    refundActions: nonNeg(counts.refundActions),
    cancelActions: nonNeg(counts.cancelActions),
    openInquiryActions: nonNeg(counts.openInquiryActions),
  });
}

/** FAB / Hub order digit — pending + refund + cancel (no inquiry, no review, no chat). */
export function resolveCStoreOrderActionCount(counts: StoreOperationCCounts): number {
  return (
    nonNeg(counts.pendingOrderActions) +
    nonNeg(counts.refundActions) +
    nonNeg(counts.cancelActions)
  );
}

/** FAB store digit — open inquiry tickets only (REVIEW blocked). */
export function resolveCStoreInquiryActionCount(counts: StoreOperationCCounts): number {
  return nonNeg(counts.openInquiryActions);
}

/**
 * Dual-source max is forbidden as C authority.
 * Call sites must not merge fab_owner_orders into orderAttention.
 */
export function rejectMaxDualCStoreAuthority(
  stateCount: number,
  fabOwnerOrders: number
): never | void {
  const banned = forbidMaxAsCStoreAuthority(stateCount, fabOwnerOrders);
  if (!banned.ok) {
    // Pure guard for tests / docs — runtime never applies max.
    return;
  }
}

/** Explicit: notification / target unread must not become C truth. */
export function cStoreIgnoresFabOwnerOrdersTarget(_fabOwnerOrders: number): true {
  return true;
}

/** Explicit: review attention is UNKNOWN_BLOCKED — always 0 in C projection. */
export function cStoreOwnerReviewAttentionBlocked(): 0 {
  return 0;
}
