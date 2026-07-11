/**
 * Phase 3-1 — normalized persistence operations for shadow compare.
 * Covers notification_events + notification_targets only.
 */

export type CreateNotificationEventOperation = {
  kind: "create_notification_event";
  userId: string;
  roomId?: string;
  messageId?: string;
  eventType?: string;
  dedupeKey?: string;
  unread?: boolean;
  mutedSnapshot?: boolean;
  pushSuppressedReason?: string | null;
  soundSuppressedReason?: string | null;
};

export type BumpNotificationTargetOperation = {
  kind: "bump_notification_target";
  userId: string;
  roomId?: string;
  targetType?: string;
  targetId?: string;
  scope?: string;
};

export type ClearNotificationTargetOperation = {
  kind: "clear_notification_target";
  userId: string;
  roomId?: string;
  targetType?: string;
  targetId?: string;
};

export type MarkRoomNotificationEventsReadOperation = {
  kind: "mark_room_notification_events_read";
  userId: string;
  roomId?: string;
};

export type PersistenceOperation =
  | CreateNotificationEventOperation
  | BumpNotificationTargetOperation
  | ClearNotificationTargetOperation
  | MarkRoomNotificationEventsReadOperation;

export type PersistencePlan = {
  operations: PersistenceOperation[];
};

export function persistenceOperationKey(op: PersistenceOperation): string {
  const parts = [
    op.kind,
    op.userId,
    "roomId" in op ? (op.roomId ?? "") : "",
    "messageId" in op ? (op.messageId ?? "") : "",
    "eventType" in op ? (op.eventType ?? "") : "",
    "dedupeKey" in op ? (op.dedupeKey ?? "") : "",
    "unread" in op ? String(op.unread ?? "") : "",
    "mutedSnapshot" in op ? String(op.mutedSnapshot ?? "") : "",
    "pushSuppressedReason" in op ? (op.pushSuppressedReason ?? "") : "",
    "soundSuppressedReason" in op ? (op.soundSuppressedReason ?? "") : "",
    "targetType" in op ? (op.targetType ?? "") : "",
    "targetId" in op ? (op.targetId ?? "") : "",
    "scope" in op ? (op.scope ?? "") : "",
  ];
  return parts.join("|");
}

export function sortPersistenceOperations(ops: PersistenceOperation[]): PersistenceOperation[] {
  return [...ops].sort((a, b) => persistenceOperationKey(a).localeCompare(persistenceOperationKey(b)));
}

export function createPersistencePlan(operations: PersistenceOperation[]): PersistencePlan {
  return { operations: sortPersistenceOperations(operations) };
}
