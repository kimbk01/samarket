/**
 * CUT 5 — pure Owner request transition rules.
 * Owner cannot approve/activate campaigns. Payment alone never activates.
 */

import type {
  PlatformPopupOwnerPaymentStatus,
  PlatformPopupOwnerRequestAdminAction,
  PlatformPopupOwnerRequestStatus,
} from "@/lib/platform-popup/owner-request-types";
import {
  assertPlatformPopupActivationAllowed,
  canSetPlatformPopupApproval,
} from "@/lib/platform-popup/campaign-lifecycle";

type OwnerEdge = readonly [PlatformPopupOwnerRequestStatus, PlatformPopupOwnerRequestStatus];

const OWNER_EDGES: readonly OwnerEdge[] = [
  ["draft", "submitted"],
  ["draft", "cancelled"],
  ["revision_required", "submitted"],
  ["revision_required", "cancelled"],
  ["submitted", "cancelled"],
  ["under_review", "cancelled"],
];

const ADMIN_EDGES: readonly OwnerEdge[] = [
  ["submitted", "under_review"],
  ["submitted", "approved"],
  ["submitted", "rejected"],
  ["submitted", "revision_required"],
  ["under_review", "approved"],
  ["under_review", "rejected"],
  ["under_review", "revision_required"],
  ["revision_required", "under_review"],
  ["revision_required", "approved"],
  ["revision_required", "rejected"],
];

function hasEdge(
  edges: readonly OwnerEdge[],
  from: PlatformPopupOwnerRequestStatus,
  to: PlatformPopupOwnerRequestStatus
): boolean {
  return edges.some(([a, b]) => a === from && b === to);
}

export function canOwnerTransitionPlatformPopupRequest(
  from: PlatformPopupOwnerRequestStatus,
  to: PlatformPopupOwnerRequestStatus
): boolean {
  if (from === to) return false;
  return hasEdge(OWNER_EDGES, from, to);
}

export function canAdminTransitionPlatformPopupRequest(
  from: PlatformPopupOwnerRequestStatus,
  to: PlatformPopupOwnerRequestStatus
): boolean {
  if (from === to) return false;
  return hasEdge(ADMIN_EDGES, from, to);
}

export function isOwnerEditablePlatformPopupRequest(
  status: PlatformPopupOwnerRequestStatus
): boolean {
  return status === "draft" || status === "revision_required";
}

export function isOwnerSubmitEligiblePlatformPopupRequest(
  status: PlatformPopupOwnerRequestStatus
): boolean {
  return status === "draft" || status === "revision_required";
}

export function nextStatusForAdminAction(
  action: PlatformPopupOwnerRequestAdminAction
): PlatformPopupOwnerRequestStatus {
  switch (action) {
    case "start_review":
      return "under_review";
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "revision_required":
      return "revision_required";
  }
}

export function nextPaymentAfterReject(
  current: PlatformPopupOwnerPaymentStatus
): PlatformPopupOwnerPaymentStatus {
  if (current === "funded") return "refunded";
  return current;
}

/**
 * Hard: Owner never sets campaign approval=approved or status active/scheduled.
 * Returns ok:true when authority correctly blocks owner.
 */
export function assertOwnerCannotApproveOrActivatePlatformPopup():
  | { ok: true }
  | { ok: false; error: "owner_can_approve_unexpected" | "owner_can_activate_unexpected" } {
  if (canSetPlatformPopupApproval("pending_review", "approved", "owner")) {
    return { ok: false, error: "owner_can_approve_unexpected" };
  }
  const activation = assertPlatformPopupActivationAllowed({
    actor: "owner",
    nextStatus: "active",
    nextApproval: "approved",
  });
  if (activation.ok) {
    return { ok: false, error: "owner_can_activate_unexpected" };
  }
  return { ok: true };
}

/** payment actor never activates campaign — CUT 5 hard rule. */
export function assertPaymentDoesNotActivatePlatformPopup():
  | { ok: true }
  | { ok: false; error: "payment_can_activate_unexpected" } {
  const r = assertPlatformPopupActivationAllowed({
    actor: "payment",
    nextStatus: "active",
    nextApproval: "approved",
  });
  if (r.ok) {
    return { ok: false, error: "payment_can_activate_unexpected" };
  }
  return { ok: true };
}
