import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type ChatListSortableRoom = Pick<
  CommunityMessengerRoomSummary,
  "id" | "isPinned" | "lastMessageAt" | "title"
> & {
  /**
   * 정렬 SSOT alias — DB `last_message_at` 이 lastActivityAt 권위.
   * (메시지 createdAt 과 노출된 통화 eventAt 의 max 가 writer 에서 반영됨)
   */
  lastActivityAt?: string | null;
};

/**
 * lastActivityAt SSOT.
 * 방이 `lastActivityAt` 을 채우면 그걸 쓰고, 없으면 `lastMessageAt`(= rooms.last_message_at) 사용.
 * 유효값 없으면 0 (현재 시각 fallback 금지 — rollback/점프 방지).
 */
export function resolveChatListLastActivityAtMs(room: {
  lastMessageAt?: string | null;
  lastActivityAt?: string | null;
}): number {
  const activity = new Date(String(room.lastActivityAt ?? "")).getTime();
  if (Number.isFinite(activity) && activity > 0) return activity;
  const last = new Date(String(room.lastMessageAt ?? "")).getTime();
  return Number.isFinite(last) ? last : 0;
}

/** @deprecated use resolveChatListLastActivityAtMs — lastMessageAt 은 activity 권위의 저장 컬럼 */
export function resolveChatListLastEventAtMs(room: { lastMessageAt?: string | null; lastActivityAt?: string | null }): number {
  return resolveChatListLastActivityAtMs(room);
}

/** pinned → lastActivityAt DESC → room.id ASC */
export function compareChatListRooms(a: ChatListSortableRoom, b: ChatListSortableRoom): number {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
  const timeA = resolveChatListLastActivityAtMs(a);
  const timeB = resolveChatListLastActivityAtMs(b);
  if (timeA !== timeB) return timeB - timeA;
  return String(a.id).localeCompare(String(b.id));
}

export function sortChatListRooms<T extends ChatListSortableRoom>(rooms: T[]): T[] {
  return [...rooms].sort(compareChatListRooms);
}

export type UnifiedChatListSortable = {
  room: ChatListSortableRoom;
  lastEventAt: string;
};

export function compareUnifiedChatListItems(a: UnifiedChatListSortable, b: UnifiedChatListSortable): number {
  const roomCmp = compareChatListRooms(a.room, b.room);
  if (roomCmp !== 0) return roomCmp;
  const timeA = resolveChatListLastActivityAtMs({ lastMessageAt: a.lastEventAt });
  const timeB = resolveChatListLastActivityAtMs({ lastMessageAt: b.lastEventAt });
  if (timeA !== timeB) return timeB - timeA;
  return String(a.room.id).localeCompare(String(b.room.id));
}

export function sortUnifiedChatListItems<T extends UnifiedChatListSortable>(items: T[]): T[] {
  return [...items].sort(compareUnifiedChatListItems);
}
