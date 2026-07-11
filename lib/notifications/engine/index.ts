/**
 * Phase 2 — Notification Engine public surface.
 */

export type { NotificationDecision } from "@/lib/notifications/engine/notification-decision";
export { createNotificationDecision } from "@/lib/notifications/engine/notification-decision";
export type {
  ChatMessageCreatedNotificationEvent,
  ChatRoomReadNotificationEvent,
  CmNotificationRoomKind,
  GroupMessageCreatedNotificationEvent,
  GroupRoomReadNotificationEvent,
  MessageCreatedNotificationEvent,
  NotificationEvent,
  NotificationEventType,
  RoomReadNotificationEvent,
} from "@/lib/notifications/engine/notification-event";
export {
  isMessageCreatedNotificationEvent,
  isRoomReadNotificationEvent,
  notificationEventTypeForRoomKind,
} from "@/lib/notifications/engine/notification-event";
export type {
  MessageCreatedProducerIngress,
  NotificationEngineIngress,
  RoomReadProducerIngress,
} from "@/lib/notifications/engine/notification-engine-ingress";
export {
  evaluateNotificationEngineDecision,
  type NotificationEnginePolicyContext,
} from "@/lib/notifications/engine/notification-engine-policy";
export {
  logNotificationEngineShadowResult,
  runNotificationEngine,
  type NotificationEngineResult,
} from "@/lib/notifications/engine/notification-engine";
export { runLegacyMessageCreatedNotificationEngineAdapter } from "@/lib/notifications/engine/adapters/legacy-message-created-adapter";
export {
  runLegacyRoomReadNotificationEngineAdapter,
  type LegacyRoomReadNotificationEngineAdapterInput,
} from "@/lib/notifications/engine/adapters/legacy-room-read-adapter";
export {
  runLegacyTargetBumpNotificationEngineAdapter,
  type LegacyTargetBumpNotificationEngineAdapterInput,
} from "@/lib/notifications/engine/adapters/legacy-target-bump-adapter";
export {
  appendNotificationEventLog,
  getNotificationEventLogSnapshot,
  latestNotificationEventLogEntry,
  replayNotificationEventLog,
  resetNotificationEventLogForTests,
  type NotificationEventLogEntry,
} from "@/lib/notifications/engine/notification-event-log";
export { runEnginePersistencePipeline } from "@/lib/notifications/engine/run-engine-persistence-pipeline";
export { comparePersistencePlans } from "@/lib/notifications/engine/persistence/persistence-shadow-compare";
