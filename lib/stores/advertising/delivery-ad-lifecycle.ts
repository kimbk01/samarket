/**
 * CUT B — Campaign lifecycle + review status + transition authority (ONE place).
 * is_active boolean alone is NOT lifecycle SSOT.
 */

export const DELIVERY_AD_LIFECYCLE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED_OWNER",
  "PAUSED_ADMIN",
  "EXHAUSTED",
  "REJECTED",
  "ENDED",
  "TERMINATED",
  "ARCHIVED",
] as const;
export type DeliveryAdLifecycleStatus = (typeof DELIVERY_AD_LIFECYCLE_STATUSES)[number];

export const DELIVERY_AD_REVIEW_STATUSES = [
  "NOT_SUBMITTED",
  "PENDING",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
] as const;
export type DeliveryAdReviewStatus = (typeof DELIVERY_AD_REVIEW_STATUSES)[number];

export type DeliveryAdActorRole = "owner" | "admin" | "system";

const OWNER_TRANSITIONS: ReadonlyArray<readonly [DeliveryAdLifecycleStatus, DeliveryAdLifecycleStatus]> =
  [
    ["DRAFT", "SUBMITTED"],
    ["CHANGES_REQUESTED", "SUBMITTED"],
    ["ACTIVE", "PAUSED_OWNER"],
    ["PAUSED_OWNER", "ACTIVE"],
    ["PAUSED_OWNER", "ENDED"],
    ["ACTIVE", "ENDED"],
    ["ENDED", "ARCHIVED"],
    ["REJECTED", "ARCHIVED"],
  ];

const ADMIN_TRANSITIONS: ReadonlyArray<readonly [DeliveryAdLifecycleStatus, DeliveryAdLifecycleStatus]> =
  [
    ["SUBMITTED", "UNDER_REVIEW"],
    ["UNDER_REVIEW", "APPROVED"],
    ["UNDER_REVIEW", "CHANGES_REQUESTED"],
    ["UNDER_REVIEW", "REJECTED"],
    ["APPROVED", "SCHEDULED"],
    ["APPROVED", "ACTIVE"],
    ["SCHEDULED", "ACTIVE"],
    ["SCHEDULED", "PAUSED_ADMIN"],
    ["SCHEDULED", "ENDED"],
    ["SCHEDULED", "TERMINATED"],
    ["ACTIVE", "PAUSED_ADMIN"],
    ["ACTIVE", "EXHAUSTED"],
    ["ACTIVE", "ENDED"],
    ["ACTIVE", "TERMINATED"],
    ["PAUSED_OWNER", "PAUSED_ADMIN"],
    ["PAUSED_OWNER", "ENDED"],
    ["PAUSED_ADMIN", "ACTIVE"],
    ["PAUSED_ADMIN", "ENDED"],
    ["PAUSED_ADMIN", "TERMINATED"],
    ["ENDED", "ARCHIVED"],
    ["REJECTED", "ARCHIVED"],
    ["TERMINATED", "ARCHIVED"],
  ];

const SYSTEM_TRANSITIONS: ReadonlyArray<readonly [DeliveryAdLifecycleStatus, DeliveryAdLifecycleStatus]> =
  [
    ["SCHEDULED", "ACTIVE"],
    ["ACTIVE", "EXHAUSTED"],
    ["ACTIVE", "ENDED"],
  ];

function hasEdge(
  edges: ReadonlyArray<readonly [DeliveryAdLifecycleStatus, DeliveryAdLifecycleStatus]>,
  from: DeliveryAdLifecycleStatus,
  to: DeliveryAdLifecycleStatus
): boolean {
  return edges.some(([a, b]) => a === from && b === to);
}

export function canTransitionDeliveryAdLifecycle(
  from: DeliveryAdLifecycleStatus,
  to: DeliveryAdLifecycleStatus,
  actor: DeliveryAdActorRole
): boolean {
  if (from === to) return false;
  if (actor === "owner") return hasEdge(OWNER_TRANSITIONS, from, to);
  if (actor === "admin") {
    return hasEdge(ADMIN_TRANSITIONS, from, to) || hasEdge(OWNER_TRANSITIONS, from, to);
  }
  return hasEdge(SYSTEM_TRANSITIONS, from, to);
}

/** Owner cannot perform Admin review decisions on lifecycle. */
export function canOwnerRequestLifecycleTransition(
  from: DeliveryAdLifecycleStatus,
  to: DeliveryAdLifecycleStatus
): boolean {
  return canTransitionDeliveryAdLifecycle(from, to, "owner");
}

export function assertDeliveryAdLifecycleTransition(
  from: DeliveryAdLifecycleStatus,
  to: DeliveryAdLifecycleStatus,
  actor: DeliveryAdActorRole
): { ok: true } | { ok: false; error: "illegal_transition" } {
  if (!canTransitionDeliveryAdLifecycle(from, to, actor)) {
    return { ok: false, error: "illegal_transition" };
  }
  return { ok: true };
}

/** Sync helper: lifecycle that should keep legacy is_active true for runtime. */
export function lifecycleImpliesIsActive(status: DeliveryAdLifecycleStatus): boolean {
  return status === "ACTIVE" || status === "SCHEDULED";
}

export const DELIVERY_AD_PRICING_MODELS = [
  "CPC",
  "CPA_ORDER",
  "ORDER_PERCENT",
  "FIXED_PERIOD",
] as const;
export type DeliveryAdPricingModel = (typeof DELIVERY_AD_PRICING_MODELS)[number];

/** Vocabulary only — charge execution is CUT H. */
export const DELIVERY_AD_PRICING_CONTRACT = {
  models: DELIVERY_AD_PRICING_MODELS,
  chargeExecution: false,
  budgetLedger: false,
  refund: false,
  note: "pricing_model definition only; billing_status must not claim implemented",
} as const;
