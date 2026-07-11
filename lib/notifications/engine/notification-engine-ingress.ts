/**
 * Phase 2 — Producer ingress (MessageCreated · RoomRead only).
 */

import type { NotificationDecision } from "@/lib/notifications/engine/notification-decision";
import type { CmNotificationRoomKind } from "@/lib/notifications/engine/notification-event";

export type MessageCreatedProducerIngress = {
  kind: "message_created";
  messageId: string;
  roomId: string;
  senderUserId: string;
  recipientUserId: string;
  createdAt: string;
  roomKind: CmNotificationRoomKind;
  causation?: string;
  /**
   * T0 Legacy write Decision Snapshot.
   * When set, Engine Policy must not re-evaluate mute/presence.
   */
  decisionSnapshot?: NotificationDecision;
};

export type RoomReadProducerIngress = {
  kind: "room_read";
  roomId: string;
  userId: string;
  readAt: string;
  lastReadMessageId?: string | null;
  roomKind: CmNotificationRoomKind;
  causation?: string;
};

export type NotificationEngineIngress = MessageCreatedProducerIngress | RoomReadProducerIngress;
