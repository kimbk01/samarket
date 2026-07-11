/**
 * Phase 2 — Notification Engine (OWNER).
 *
 * Producer → Event → Policy → Decision
 * Does NOT execute consumers. Does NOT mutate participants / messages.
 */

import type { NotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { NotificationEngineIngress } from "@/lib/notifications/engine/notification-engine-ingress";
import {
  evaluateNotificationEngineDecision,
  type NotificationEnginePolicyContext,
} from "@/lib/notifications/engine/notification-engine-policy";
import type {
  MessageCreatedNotificationEvent,
  NotificationEvent,
  RoomReadNotificationEvent,
} from "@/lib/notifications/engine/notification-event";
import { notificationEventTypeForRoomKind } from "@/lib/notifications/engine/notification-event";

export type NotificationEngineResult = {
  event: NotificationEvent;
  decision: NotificationDecision;
};

function buildMessageCreatedEvent(
  ingress: Extract<NotificationEngineIngress, { kind: "message_created" }>,
  decision: NotificationDecision
): MessageCreatedNotificationEvent {
  const type = notificationEventTypeForRoomKind(ingress.roomKind, "message_created");
  const base = {
    eventId: `${ingress.messageId}:${ingress.recipientUserId}`,
    type,
    roomId: ingress.roomId.trim(),
    userId: ingress.recipientUserId.trim(),
    messageId: ingress.messageId.trim(),
    senderUserId: ingress.senderUserId.trim(),
    roomKind: ingress.roomKind,
    createdAt: ingress.createdAt,
    causation: ingress.causation ?? "message_created_producer",
    decision,
  };
  if (type === "GROUP_MESSAGE_CREATED") {
    return { ...base, type: "GROUP_MESSAGE_CREATED", roomKind: "group" };
  }
  return { ...base, type: "CHAT_MESSAGE_CREATED", roomKind: "direct" };
}

function buildRoomReadEvent(
  ingress: Extract<NotificationEngineIngress, { kind: "room_read" }>,
  decision: NotificationDecision
): RoomReadNotificationEvent {
  const type = notificationEventTypeForRoomKind(ingress.roomKind, "room_read");
  const base = {
    eventId: `${ingress.roomId}:${ingress.userId}:read:${ingress.readAt}`,
    type,
    roomId: ingress.roomId.trim(),
    userId: ingress.userId.trim(),
    lastReadMessageId: ingress.lastReadMessageId ?? null,
    roomKind: ingress.roomKind,
    createdAt: ingress.readAt,
    causation: ingress.causation ?? "room_read_producer",
    decision,
  };
  if (type === "GROUP_ROOM_READ") {
    return { ...base, type: "GROUP_ROOM_READ", roomKind: "group" };
  }
  return { ...base, type: "CHAT_ROOM_READ", roomKind: "direct" };
}

export async function runNotificationEngine(
  ingress: NotificationEngineIngress,
  ctx: NotificationEnginePolicyContext = {}
): Promise<NotificationEngineResult | null> {
  const decision = await evaluateNotificationEngineDecision(ingress, ctx);

  if (ingress.kind === "message_created") {
    const event = buildMessageCreatedEvent(ingress, decision);
    return { event, decision };
  }

  const event = buildRoomReadEvent(ingress, decision);
  return { event, decision };
}

/** Shadow observability — dev / explicit env only; no product side effects. */
export function logNotificationEngineShadowResult(result: NotificationEngineResult | null, source: string): void {
  if (!result) return;
  if (typeof process === "undefined") return;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_NOTIFICATION_ENGINE_SHADOW_LOG !== "1") {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[notification-engine-shadow]", source, {
    type: result.event.type,
    eventId: result.event.eventId,
    roomId: result.event.roomId,
    userId: result.event.userId,
    decision: result.decision,
  });
}
