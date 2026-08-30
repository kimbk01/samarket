/**
 * PRODUCT CUT 3-B — Operations message table vocabulary (system timeline only).
 * Human kind reserved; no human write path in 3-B.
 */

export const DELIVERY_AD_OPERATIONS_MESSAGE_TABLE =
  "delivery_ad_operations_messages" as const;

export const DELIVERY_AD_OPERATIONS_MESSAGE_KINDS = [
  "system_lifecycle",
  "human",
] as const;
export type DeliveryAdOperationsMessageKind =
  (typeof DELIVERY_AD_OPERATIONS_MESSAGE_KINDS)[number];

export const DELIVERY_AD_OPERATIONS_SENDER_ROLES = [
  "system",
  "owner",
  "admin",
] as const;
export type DeliveryAdOperationsSenderRole =
  (typeof DELIVERY_AD_OPERATIONS_SENDER_ROLES)[number];

export const DELIVERY_AD_OPS_LIFECYCLE_EVENT_TYPES = [
  "SUBMITTED",
  "RESUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "PAUSED_OWNER",
  "RESUMED_OWNER",
  "PAUSED_ADMIN",
  "RESUMED_ADMIN",
  "ENDED",
  "TERMINATED",
  "ARCHIVED",
] as const;
export type DeliveryAdOpsLifecycleEventType =
  (typeof DELIVERY_AD_OPS_LIFECYCLE_EVENT_TYPES)[number];

export type DeliveryAdOperationsMessageRow = {
  id: string;
  threadId: string;
  kind: DeliveryAdOperationsMessageKind;
  senderRole: DeliveryAdOperationsSenderRole;
  sourceAuditId: string;
  eventType: string;
  messageKey: string;
  occurredAt: string;
  createdAt: string;
};
