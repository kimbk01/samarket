/**
 * PRODUCT CUT 3-B/3-C — Operations messages (system_lifecycle + human).
 */

export const DELIVERY_AD_OPERATIONS_MESSAGE_TABLE =
  "delivery_ad_operations_messages" as const;

/** Care-aligned plain-text bound (member-admin-notes human body). */
export const DELIVERY_AD_OPS_HUMAN_MESSAGE_MAX_CHARS = 4000 as const;

/** Bounded timeline read (no unbounded SELECT). */
export const DELIVERY_AD_OPS_MESSAGE_LIST_DEFAULT_LIMIT = 100 as const;
export const DELIVERY_AD_OPS_MESSAGE_LIST_MAX_LIMIT = 200 as const;

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

export type DeliveryAdOpsSystemLifecycleMessage = {
  id: string;
  threadId: string;
  kind: "system_lifecycle";
  senderRole: "system";
  senderUserId: null;
  sourceAuditId: string;
  eventType: string;
  messageKey: string;
  body: null;
  occurredAt: string;
  createdAt: string;
};

export type DeliveryAdOpsHumanMessage = {
  id: string;
  threadId: string;
  kind: "human";
  senderRole: "owner" | "admin";
  senderUserId: string;
  sourceAuditId: null;
  eventType: null;
  messageKey: null;
  body: string;
  occurredAt: string;
  createdAt: string;
};

export type DeliveryAdOperationsTimelineMessage =
  | DeliveryAdOpsSystemLifecycleMessage
  | DeliveryAdOpsHumanMessage;

/** @deprecated Prefer DeliveryAdOperationsTimelineMessage union (3-C). */
export type DeliveryAdOperationsMessageRow = DeliveryAdOperationsTimelineMessage;

export function mapDeliveryAdOperationsMessageRow(
  raw: Record<string, unknown>
): DeliveryAdOperationsTimelineMessage | null {
  const id = raw.id == null ? "" : String(raw.id);
  const threadId = raw.thread_id == null ? "" : String(raw.thread_id);
  if (!id || !threadId) return null;
  const kind = raw.kind;
  const senderRole = raw.sender_role;
  const occurredAt = String(raw.occurred_at ?? "");
  const createdAt = String(raw.created_at ?? "");

  if (kind === "system_lifecycle") {
    if (senderRole !== "system") return null;
    const sourceAuditId =
      raw.source_audit_id == null ? "" : String(raw.source_audit_id);
    const eventType = raw.event_type == null ? "" : String(raw.event_type);
    const messageKey = raw.message_key == null ? "" : String(raw.message_key);
    if (!sourceAuditId || !eventType || !messageKey) return null;
    return {
      id,
      threadId,
      kind: "system_lifecycle",
      senderRole: "system",
      senderUserId: null,
      sourceAuditId,
      eventType,
      messageKey,
      body: null,
      occurredAt,
      createdAt,
    };
  }

  if (kind === "human") {
    if (senderRole !== "owner" && senderRole !== "admin") return null;
    if (raw.source_audit_id != null) return null;
    const senderUserId =
      raw.sender_user_id == null ? "" : String(raw.sender_user_id);
    const body = typeof raw.body === "string" ? raw.body : "";
    if (!senderUserId || !body.trim()) return null;
    return {
      id,
      threadId,
      kind: "human",
      senderRole,
      senderUserId,
      sourceAuditId: null,
      eventType: null,
      messageKey: null,
      body,
      occurredAt,
      createdAt,
    };
  }

  return null;
}
