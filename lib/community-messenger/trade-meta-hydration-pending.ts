/** trade-chat-list-meta hydrate 진행 중인 roomId — inbox 분류 보류용 */
const pendingTradeMetaHydrationRoomIds = new Set<string>();

export function markTradeMetaHydrationPending(roomIds: readonly string[]): void {
  for (const id of roomIds) {
    const rid = id.trim();
    if (rid) pendingTradeMetaHydrationRoomIds.add(rid);
  }
}

export function clearTradeMetaHydrationPending(roomIds: readonly string[]): void {
  for (const id of roomIds) {
    pendingTradeMetaHydrationRoomIds.delete(id.trim());
  }
}

export function getPendingTradeMetaHydrationRoomIds(): ReadonlySet<string> {
  return pendingTradeMetaHydrationRoomIds;
}

export function isTradeMetaHydrationPending(roomId: string): boolean {
  return pendingTradeMetaHydrationRoomIds.has(roomId.trim());
}
