/**
 * CR1 chat rooms snapshot invalidation — domain events → counter refresh.
 */
import { scheduleChatRoomsSnapshotRefresh } from "@/lib/chats/chat-rooms-snapshot-refresh";

const invalidatedUserIds = new Set<string>();

export function invalidateChatRoomsSnapshotCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  invalidatedUserIds.add(k);
  scheduleChatRoomsSnapshotRefresh(k);
}

export function invalidateChatRoomsSnapshotForUsers(userIds: string[]): void {
  for (const uid of userIds) invalidateChatRoomsSnapshotCache(uid);
}

export function peekChatRoomsSnapshotInvalidated(userId: string): boolean {
  return invalidatedUserIds.has(userId.trim());
}

export function clearChatRoomsSnapshotInvalidation(userId: string): void {
  invalidatedUserIds.delete(userId.trim());
}
