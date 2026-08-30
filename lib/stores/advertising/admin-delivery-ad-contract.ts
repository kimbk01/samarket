/**
 * CUT F — Admin Delivery Ads control-plane contracts (actions, buckets, display).
 */

import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { canTransitionDeliveryAdLifecycle } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_OWNER_PRICING_PRODUCT } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export const ADMIN_DELIVERY_AD_PRODUCTS = ["store_sponsored", "banner"] as const;
export type AdminDeliveryAdProduct = (typeof ADMIN_DELIVERY_AD_PRODUCTS)[number];

export const ADMIN_DELIVERY_AD_ACTIONS = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "pause",
  "resume",
  "end",
  "terminate",
  "archive",
  "delete_safe_draft",
] as const;
export type AdminDeliveryAdAction = (typeof ADMIN_DELIVERY_AD_ACTIONS)[number];

export const ADMIN_DELIVERY_AD_LIST_BUCKETS = [
  "all",
  "needs_creative",
  "review",
  "scheduled",
  "active",
  "held",
  "ended",
  "rejected",
] as const;
export type AdminDeliveryAdListBucket = (typeof ADMIN_DELIVERY_AD_LIST_BUCKETS)[number];

export const ADMIN_DELIVERY_AD_PRICING = DELIVERY_AD_OWNER_PRICING_PRODUCT;

export function isAdminDeliveryAdProduct(v: unknown): v is AdminDeliveryAdProduct {
  return v === "store_sponsored" || v === "banner";
}

export function isAdminDeliveryAdAction(v: unknown): v is AdminDeliveryAdAction {
  return (
    typeof v === "string" &&
    (ADMIN_DELIVERY_AD_ACTIONS as readonly string[]).includes(v)
  );
}

/** Actions that require a non-empty Admin reason. */
export function adminActionRequiresReason(action: AdminDeliveryAdAction): boolean {
  return (
    action === "request_changes" ||
    action === "reject" ||
    action === "pause" ||
    action === "terminate"
  );
}

/**
 * Map Admin CTA → target lifecycle (before schedule split on approve).
 * Approve lands on APPROVED; writer then advances to SCHEDULED/ACTIVE.
 */
export function adminActionTargetLifecycle(
  action: AdminDeliveryAdAction,
  from: DeliveryAdLifecycleStatus
): DeliveryAdLifecycleStatus | null {
  switch (action) {
    case "start_review":
      return "UNDER_REVIEW";
    case "request_changes":
      return "CHANGES_REQUESTED";
    case "approve":
      return "APPROVED";
    case "reject":
      return "REJECTED";
    case "pause":
      return "PAUSED_ADMIN";
    case "resume":
      return "ACTIVE";
    case "end":
      return "ENDED";
    case "terminate":
      return "TERMINATED";
    case "archive":
      return "ARCHIVED";
    case "delete_safe_draft":
      return null;
    default:
      return null;
  }
  void from;
}

export function adminActionAllowed(
  action: AdminDeliveryAdAction,
  from: DeliveryAdLifecycleStatus
): boolean {
  if (action === "delete_safe_draft") return from === "DRAFT";
  const to = adminActionTargetLifecycle(action, from);
  if (!to) return false;
  return canTransitionDeliveryAdLifecycle(from, to, "admin");
}

/** Persist review_status after Admin action. */
export function adminActionReviewStatus(
  action: AdminDeliveryAdAction
): DeliveryAdReviewStatus | null {
  switch (action) {
    case "start_review":
      return "IN_REVIEW";
    case "request_changes":
      return "CHANGES_REQUESTED";
    case "approve":
      return "APPROVED";
    case "reject":
      return "REJECTED";
    default:
      return null;
  }
}

/** After APPROVED, choose SCHEDULED vs ACTIVE from schedule. */
export function resolveApprovedGoLiveStatus(
  startAtIso: string,
  nowMs: number = Date.now()
): "SCHEDULED" | "ACTIVE" {
  const startMs = Date.parse(startAtIso);
  if (Number.isFinite(startMs) && startMs > nowMs) return "SCHEDULED";
  return "ACTIVE";
}

/** Admin schedule edit — allows past starts for live campaigns; rejects invalid windows. */
export function validateAdminDeliveryAdSchedule(input: {
  startAtIso: string;
  endAtIso: string;
  nowMs?: number;
}):
  | { ok: true; startAt: string; endAt: string }
  | { ok: false; error: "invalid_start_at" | "invalid_end_at" | "end_before_start" | "end_in_past" } {
  const startMs = Date.parse(input.startAtIso);
  const endMs = Date.parse(input.endAtIso);
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isFinite(startMs)) return { ok: false, error: "invalid_start_at" };
  if (!Number.isFinite(endMs)) return { ok: false, error: "invalid_end_at" };
  if (endMs <= startMs) return { ok: false, error: "end_before_start" };
  if (endMs <= nowMs) return { ok: false, error: "end_in_past" };
  return {
    ok: true,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
  };
}

/** UI bucket from persisted lifecycle (not schedule-normalized). */
export function lifecycleToAdminListBucket(
  status: DeliveryAdLifecycleStatus
): Exclude<AdminDeliveryAdListBucket, "all" | "needs_creative"> | null {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "CHANGES_REQUESTED":
      return "review";
    case "APPROVED":
    case "SCHEDULED":
      return "scheduled";
    case "ACTIVE":
      return "active";
    case "PAUSED_ADMIN":
    case "PAUSED_OWNER":
      return "held";
    case "ENDED":
    case "TERMINATED":
    case "ARCHIVED":
    case "EXHAUSTED":
      return "ended";
    case "REJECTED":
      return "rejected";
    default:
      return null;
  }
}

/** Display helper: persisted lifecycle + schedule window (no silent status rewrite). */
export function normalizeAdminDisplayLifecycle(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  startAt: string;
  endAt: string;
  nowMs?: number;
}): {
  persisted: DeliveryAdLifecycleStatus;
  scheduleHint: "in_window" | "not_started" | "ended" | "invalid";
} {
  const nowMs = input.nowMs ?? Date.now();
  const startMs = Date.parse(input.startAt);
  const endMs = Date.parse(input.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { persisted: input.lifecycleStatus, scheduleHint: "invalid" };
  }
  if (endMs <= nowMs) return { persisted: input.lifecycleStatus, scheduleHint: "ended" };
  if (startMs > nowMs) return { persisted: input.lifecycleStatus, scheduleHint: "not_started" };
  return { persisted: input.lifecycleStatus, scheduleHint: "in_window" };
}

export function adminActionAuditLabel(action: AdminDeliveryAdAction): string {
  switch (action) {
    case "start_review":
      return "review_started";
    case "request_changes":
      return "changes_requested";
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    case "pause":
      return "paused_admin";
    case "resume":
      return "resumed_admin";
    case "end":
      return "ended_admin";
    case "terminate":
      return "terminated_admin";
    case "archive":
      return "archived";
    case "delete_safe_draft":
      return "deleted_safe_draft";
    default:
      return "admin_action";
  }
}
