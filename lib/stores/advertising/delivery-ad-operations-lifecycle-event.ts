/**
 * PRODUCT CUT 3-B — Map successful lifecycle audits → ops timeline presentation.
 * Not a second lifecycle authority. Unknown actions → skip (no catch-all copy).
 */

import {
  DELIVERY_AD_LIFECYCLE_STATUSES,
  type DeliveryAdLifecycleStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdOperationsCaseStatus } from "@/lib/stores/advertising/delivery-ad-operations-case";
import type { DeliveryAdOpsLifecycleEventType } from "@/lib/stores/advertising/delivery-ad-operations-message";

export type DeliveryAdOpsLifecycleEventMapping = {
  eventType: DeliveryAdOpsLifecycleEventType;
  messageKey: string;
  caseEffect: DeliveryAdOperationsCaseStatus | null;
};

function isLifecycle(v: unknown): v is DeliveryAdLifecycleStatus {
  return (
    typeof v === "string" &&
    (DELIVERY_AD_LIFECYCLE_STATUSES as readonly string[]).includes(v)
  );
}

/** Extract lifecycle from audit before_json / after_json (Owner + Admin shapes). */
export function lifecycleFromAuditJson(json: unknown): DeliveryAdLifecycleStatus | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (isLifecycle(o.lifecycle_status)) return o.lifecycle_status;
  if (isLifecycle(o.lifecycle)) return o.lifecycle;
  return null;
}

function mapping(
  eventType: DeliveryAdOpsLifecycleEventType,
  caseEffect: DeliveryAdOperationsCaseStatus | null
): DeliveryAdOpsLifecycleEventMapping {
  return {
    eventType,
    messageKey: `delivery_ad_ops_${eventType.toLowerCase()}`,
    caseEffect,
  };
}

/**
 * Map from/to (+ audit action) to ops event. Returns null → skip timeline (unsupported).
 */
export function mapDeliveryAdLifecycleAuditToOpsEvent(input: {
  fromLifecycle: DeliveryAdLifecycleStatus | null;
  toLifecycle: DeliveryAdLifecycleStatus | null;
  auditAction: string;
  actorType: string;
}): DeliveryAdOpsLifecycleEventMapping | null {
  const action = String(input.auditAction ?? "").trim();
  const from = input.fromLifecycle;
  const to = input.toLifecycle;

  // Explicit action-first for Owner labels / Admin labels (stable identity)
  if (
    action === "submitted" ||
    action === "owner_banner_submit" ||
    (from === "DRAFT" && to === "SUBMITTED")
  ) {
    return mapping("SUBMITTED", "WAITING_ADMIN");
  }
  if (
    action === "resubmitted" ||
    action === "owner_banner_resubmit" ||
    (from === "CHANGES_REQUESTED" && to === "SUBMITTED")
  ) {
    return mapping("RESUBMITTED", "WAITING_ADMIN");
  }
  if (action === "review_started" || to === "UNDER_REVIEW") {
    return mapping("UNDER_REVIEW", null);
  }
  if (action === "changes_requested" || to === "CHANGES_REQUESTED") {
    return mapping("CHANGES_REQUESTED", "WAITING_OWNER");
  }
  if (action === "approved") {
    // Admin approve may land SCHEDULED|ACTIVE in same txn — still APPROVED ops event
    return mapping("APPROVED", null);
  }
  if (action === "rejected" || to === "REJECTED") {
    return mapping("REJECTED", "RESOLVED");
  }
  if (
    action === "paused_owner" ||
    action === "owner_banner_pause" ||
    to === "PAUSED_OWNER"
  ) {
    return mapping("PAUSED_OWNER", null);
  }
  if (
    action === "resumed_owner" ||
    action === "owner_banner_resume" ||
    (from === "PAUSED_OWNER" && to === "ACTIVE")
  ) {
    return mapping("RESUMED_OWNER", null);
  }
  if (action === "paused_admin" || to === "PAUSED_ADMIN") {
    return mapping("PAUSED_ADMIN", "WAITING_OWNER");
  }
  if (action === "resumed_admin" || (from === "PAUSED_ADMIN" && to === "ACTIVE")) {
    return mapping("RESUMED_ADMIN", null);
  }
  if (
    action === "ended_owner" ||
    action === "owner_banner_end" ||
    action === "ended_admin" ||
    to === "ENDED"
  ) {
    return mapping("ENDED", "RESOLVED");
  }
  if (action === "terminated_admin" || to === "TERMINATED") {
    return mapping("TERMINATED", "RESOLVED");
  }
  if (action === "archived" || to === "ARCHIVED") {
    return mapping("ARCHIVED", "RESOLVED");
  }

  void input.actorType;
  return null;
}

/** Supported event types for contract coverage (no catch-all). */
export const DELIVERY_AD_OPS_REQUIRED_EVENT_COVERAGE: ReadonlyArray<{
  label: string;
  from: DeliveryAdLifecycleStatus | null;
  to: DeliveryAdLifecycleStatus | null;
  action: string;
  expect: DeliveryAdOpsLifecycleEventType;
}> = [
  { label: "owner_submit", from: "DRAFT", to: "SUBMITTED", action: "submitted", expect: "SUBMITTED" },
  {
    label: "owner_resubmit",
    from: "CHANGES_REQUESTED",
    to: "SUBMITTED",
    action: "resubmitted",
    expect: "RESUBMITTED",
  },
  {
    label: "admin_start_review",
    from: "SUBMITTED",
    to: "UNDER_REVIEW",
    action: "review_started",
    expect: "UNDER_REVIEW",
  },
  {
    label: "admin_changes",
    from: "UNDER_REVIEW",
    to: "CHANGES_REQUESTED",
    action: "changes_requested",
    expect: "CHANGES_REQUESTED",
  },
  {
    label: "admin_approve_active",
    from: "UNDER_REVIEW",
    to: "ACTIVE",
    action: "approved",
    expect: "APPROVED",
  },
  {
    label: "admin_reject",
    from: "UNDER_REVIEW",
    to: "REJECTED",
    action: "rejected",
    expect: "REJECTED",
  },
  {
    label: "owner_pause",
    from: "ACTIVE",
    to: "PAUSED_OWNER",
    action: "paused_owner",
    expect: "PAUSED_OWNER",
  },
  {
    label: "owner_resume",
    from: "PAUSED_OWNER",
    to: "ACTIVE",
    action: "resumed_owner",
    expect: "RESUMED_OWNER",
  },
  {
    label: "admin_pause",
    from: "ACTIVE",
    to: "PAUSED_ADMIN",
    action: "paused_admin",
    expect: "PAUSED_ADMIN",
  },
  {
    label: "admin_resume",
    from: "PAUSED_ADMIN",
    to: "ACTIVE",
    action: "resumed_admin",
    expect: "RESUMED_ADMIN",
  },
  { label: "owner_end", from: "ACTIVE", to: "ENDED", action: "ended_owner", expect: "ENDED" },
  {
    label: "admin_terminate",
    from: "ACTIVE",
    to: "TERMINATED",
    action: "terminated_admin",
    expect: "TERMINATED",
  },
  {
    label: "admin_archive",
    from: "ENDED",
    to: "ARCHIVED",
    action: "archived",
    expect: "ARCHIVED",
  },
];
