import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type ChatListSortableRoom = Pick<
  CommunityMessengerRoomSummary,
  "isPinned" | "unreadCount" | "lastMessageAt" | "title"
>;

function roomSortTimestamp(room: ChatListSortableRoom): number {
  const last = new Date(room.lastMessageAt).getTime();
  return Number.isFinite(last) ? last : 0;
}

/** pinned → unread>0 → lastMessageAt DESC → updatedAt DESC → title */
export function compareChatListRooms(a: ChatListSortableRoom, b: ChatListSortableRoom): number {
  if (Boolean(a.isPinned) !== Boolean(b.isPinned)) return a.isPinned ? -1 : 1;
  const unreadA = Math.max(0, a.unreadCount) > 0 ? 1 : 0;
  const unreadB = Math.max(0, b.unreadCount) > 0 ? 1 : 0;
  if (unreadA !== unreadB) return unreadB - unreadA;
  const timeA = roomSortTimestamp(a);
  const timeB = roomSortTimestamp(b);
  if (timeA !== timeB) return timeB - timeA;
  return a.title.localeCompare(b.title, "ko");
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
  const timeA = new Date(a.lastEventAt).getTime();
  const timeB = new Date(b.lastEventAt).getTime();
  if (timeA !== timeB) return timeB - timeA;
  return 0;
}

export function sortUnifiedChatListItems<T extends UnifiedChatListSortable>(items: T[]): T[] {
  return [...items].sort(compareUnifiedChatListItems);
}
