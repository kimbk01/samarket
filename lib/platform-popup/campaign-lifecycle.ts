/**
 * Platform Popup CUT 1 — campaign lifecycle + Admin approval enforcement (pure).
 * payment != approval. Owner cannot APPROVE / ACTIVE. Payment cannot ACTIVE.
 */

import type {
  PlatformPopupActorRole,
  PlatformPopupApprovalStatus,
  PlatformPopupCampaignStatus,
} from "@/lib/platform-popup/types";

export type PlatformPopupLifecycleState = {
  status: PlatformPopupCampaignStatus;
  approvalStatus: PlatformPopupApprovalStatus;
};

type Edge = readonly [PlatformPopupCampaignStatus, PlatformPopupCampaignStatus];

const OWNER_STATUS_EDGES: readonly Edge[] = [
  ["draft", "pending_review"],
  ["rejected", "pending_review"],
  ["paused", "ended"],
];

const ADMIN_STATUS_EDGES: readonly Edge[] = [
  ["draft", "pending_review"],
  ["pending_review", "approved"],
  ["pending_review", "rejected"],
  ["approved", "scheduled"],
  ["approved", "active"],
  ["scheduled", "active"],
  ["scheduled", "paused"],
  ["scheduled", "ended"],
  ["active", "paused"],
  ["active", "ended"],
  ["paused", "active"],
  ["paused", "ended"],
  ["rejected", "pending_review"],
];

const SYSTEM_STATUS_EDGES: readonly Edge[] = [
  ["scheduled", "active"],
  ["scheduled", "ended"],
  ["active", "ended"],
];

function hasEdge(edges: readonly Edge[], from: PlatformPopupCampaignStatus, to: PlatformPopupCampaignStatus): boolean {
  return edges.some(([a, b]) => a === from && b === to);
}

export function canTransitionPlatformPopupStatus(
  from: PlatformPopupCampaignStatus,
  to: PlatformPopupCampaignStatus,
  actor: PlatformPopupActorRole
): boolean {
  if (from === to) return false;
  if (actor === "payment") return false;
  if (actor === "owner") return hasEdge(OWNER_STATUS_EDGES, from, to);
  if (actor === "admin") {
    return hasEdge(ADMIN_STATUS_EDGES, from, to) || hasEdge(OWNER_STATUS_EDGES, from, to);
  }
  if (actor === "system") return hasEdge(SYSTEM_STATUS_EDGES, from, to);
  return false;
}

export function canSetPlatformPopupApproval(
  from: PlatformPopupApprovalStatus,
  to: PlatformPopupApprovalStatus,
  actor: PlatformPopupActorRole
): boolean {
  if (from === to) return false;
  if (actor === "payment") return false;
  if (actor === "owner") {
    // Owner may only submit for review from not_submitted / rejected.
    return (
      (from === "not_submitted" || from === "rejected") && to === "pending_review"
    );
  }
  if (actor === "admin") {
    if (to === "approved" || to === "rejected") {
      return from === "pending_review" || from === "not_submitted" || from === "approved";
    }
    if (to === "pending_review") return true;
    return false;
  }
  return false;
}

/**
 * Hard authority: ACTIVE/SCHEDULED requires Admin approval.
 * Payment / owner must never produce approval_status=approved.
 */
export function assertPlatformPopupActivationAllowed(input: {
  actor: PlatformPopupActorRole;
  nextStatus: PlatformPopupCampaignStatus;
  nextApproval: PlatformPopupApprovalStatus;
}): { ok: true } | { ok: false; error: string } {
  const { actor, nextStatus, nextApproval } = input;

  if (actor === "payment") {
    return { ok: false, error: "payment_cannot_activate" };
  }

  if (nextApproval === "approved" && actor !== "admin") {
    return { ok: false, error: "owner_cannot_approve" };
  }

  if (
    (nextStatus === "active" || nextStatus === "scheduled") &&
    nextApproval !== "approved"
  ) {
    return { ok: false, error: "activation_requires_admin_approval" };
  }

  if ((nextStatus === "active" || nextStatus === "scheduled") && actor === "owner") {
    return { ok: false, error: "owner_cannot_activate" };
  }

  if ((nextStatus === "active" || nextStatus === "scheduled") && actor !== "admin" && actor !== "system") {
    return { ok: false, error: "activation_requires_admin_or_system" };
  }

  return { ok: true };
}

export function isPlatformPopupStatusScheduleEligible(
  status: PlatformPopupCampaignStatus,
  approvalStatus: PlatformPopupApprovalStatus
): boolean {
  if (approvalStatus !== "approved") return false;
  return status === "active" || status === "scheduled";
}

export function isPlatformPopupWithinScheduleWindow(input: {
  now: Date;
  startAt?: string | Date | null;
  endAt?: string | Date | null;
}): boolean {
  const nowMs = input.now.getTime();
  if (input.startAt != null) {
    const start = input.startAt instanceof Date ? input.startAt : new Date(input.startAt);
    if (Number.isNaN(start.getTime()) || nowMs < start.getTime()) return false;
  }
  if (input.endAt != null) {
    const end = input.endAt instanceof Date ? input.endAt : new Date(input.endAt);
    if (Number.isNaN(end.getTime()) || nowMs >= end.getTime()) return false;
  }
  return true;
}
