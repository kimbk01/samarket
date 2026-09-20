/**
 * Pure lifecycle — cloned from platform_popup_owner_requests pattern.
 * Owner cannot approve/publish/send Push.
 */

import type {
  PlatformEventOwnerAdminAction,
  PlatformEventOwnerRequestStatus,
} from "@/lib/platform-event-owner-requests/types";

type Edge = readonly [PlatformEventOwnerRequestStatus, PlatformEventOwnerRequestStatus];

const OWNER_EDGES: readonly Edge[] = [
  ["draft", "submitted"],
  ["draft", "cancelled"],
  ["revision_required", "submitted"],
  ["revision_required", "cancelled"],
  ["submitted", "cancelled"],
  ["under_review", "cancelled"],
];

const ADMIN_EDGES: readonly Edge[] = [
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
  edges: readonly Edge[],
  from: PlatformEventOwnerRequestStatus,
  to: PlatformEventOwnerRequestStatus
): boolean {
  return edges.some(([a, b]) => a === from && b === to);
}

export function canOwnerTransitionEventPromoRequest(
  from: PlatformEventOwnerRequestStatus,
  to: PlatformEventOwnerRequestStatus
): boolean {
  if (from === to) return false;
  return hasEdge(OWNER_EDGES, from, to);
}

export function canAdminTransitionEventPromoRequest(
  from: PlatformEventOwnerRequestStatus,
  to: PlatformEventOwnerRequestStatus
): boolean {
  if (from === to) return false;
  return hasEdge(ADMIN_EDGES, from, to);
}

export function isOwnerEditableEventPromoRequest(
  status: PlatformEventOwnerRequestStatus
): boolean {
  return status === "draft" || status === "revision_required";
}

export function isOwnerSubmitEligibleEventPromoRequest(
  status: PlatformEventOwnerRequestStatus
): boolean {
  return status === "draft" || status === "revision_required";
}

export function nextStatusForEventPromoAdminAction(
  action: PlatformEventOwnerAdminAction
): PlatformEventOwnerRequestStatus {
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

/** Owner must never mutate public Event / Distribution / Push send. */
export const OWNER_FORBIDDEN_ACTIONS = [
  "publish_event",
  "edit_live_event",
  "save_distribution",
  "send_push",
  "set_global_audience",
] as const;

export function assertOwnerActionAllowed(
  action: (typeof OWNER_FORBIDDEN_ACTIONS)[number]
): { ok: false; error: "owner_forbidden" } {
  void action;
  return { ok: false, error: "owner_forbidden" };
}
