/**
 * Room list row badge = unread messages + room-attached missed calls.
 * Hub/Bottom/App Icon use unread **room** count of rows where this > 0.
 */

export function resolveRoomListBadgeCount(input: {
  unreadCount?: number | null;
  missedCallCount?: number | null;
}): number {
  const messages = Math.max(0, Math.floor(Number(input.unreadCount) || 0));
  const missed = Math.max(0, Math.floor(Number(input.missedCallCount) || 0));
  return messages + missed;
}
