/**
 * Phase 3-1 — Legacy room-read persistence plan (notification_targets / events).
 */

import {
  createPersistencePlan,
  type PersistenceOperation,
  type PersistencePlan,
} from "@/lib/notifications/engine/persistence/persistence-operation";

export type LegacyRoomReadPersistenceScope = "mark_read_patch" | "mark_room_read_api";

export function buildLegacyRoomReadPersistencePlan(input: {
  userId: string;
  roomId: string;
  scope: LegacyRoomReadPersistenceScope;
}): PersistencePlan {
  const userId = input.userId.trim();
  const roomId = input.roomId.trim();
  if (!userId || !roomId) return createPersistencePlan([]);

  const operations: PersistenceOperation[] = [
    {
      kind: "clear_notification_target",
      userId,
      roomId,
      targetType: "chat_room",
      targetId: roomId,
    },
  ];

  if (input.scope === "mark_room_read_api") {
    operations.unshift({
      kind: "mark_room_notification_events_read",
      userId,
      roomId,
    });
  }

  return createPersistencePlan(operations);
}
