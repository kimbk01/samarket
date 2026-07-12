import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type ChatListSortableRoom = Pick<
  CommunityMessengerRoomSummary,
  "id" | "isPinned" | "lastMessageAt" | "title"
>;

/** 명시적 lastMessageAt → 유효값 없으면 0 (현재 시각 fallback 금지) */
export function resolveChatListLastEventAtMs(room: { lastMessageAt?: string | null }): number {
  const last = new Date(String(room.lastMessageAt ?? "")).getTime();
  return Number.isFinite(last) ? last : 0;
}

/** pinned → lastEventAt DESC → room.id ASC */
export function compareChatListRooms(a: ChatListSortableRoom, b: ChatListSortableRoom): number {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
  const timeA = resolveChatListLastEventAtMs(a);
  const timeB = resolveChatListLastEventAtMs(b);
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
  const timeA = resolveChatListLastEventAtMs({ lastMessageAt: a.lastEventAt });
  const timeB = resolveChatListLastEventAtMs({ lastMessageAt: b.lastEventAt });
  if (timeA !== timeB) return timeB - timeA;
  return String(a.room.id).localeCompare(String(b.room.id));
}

export function sortUnifiedChatListItems<T extends UnifiedChatListSortable>(items: T[]): T[] {
  return [...items].sort(compareUnifiedChatListItems);
}
