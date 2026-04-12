import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { ChatStoreLastEventType, ChatStoreRoom, ChatStoreRoomType } from "@/lib/community-messenger/stores/useChatStore";

function mapRoomType(room: CommunityMessengerRoomSummary): ChatStoreRoomType {
  const ctx = room.contextMeta;
  if (ctx?.kind === "trade") return "trade";
  if (ctx?.kind === "delivery") return "delivery";
  if (room.roomType === "direct") return "direct";
  if (room.roomType === "open_group") return "openchat";
  return "group";
}

function mapLastEventType(lastMessageType: CommunityMessengerRoomSummary["lastMessageType"]): ChatStoreLastEventType {
  switch (lastMessageType) {
    case "call_stub":
      return "voice_call";
    case "system":
      return "system";
    default:
      return "message";
  }
}

/** 부트스트랩/목록 API 응답으로 `useChatStore` 시드 */
export function chatStoreRoomsFromSummaries(rooms: CommunityMessengerRoomSummary[]): ChatStoreRoom[] {
  return rooms.map((room) => ({
    id: room.id,
    type: mapRoomType(room),
    name: room.title,
    imageUrl: room.avatarUrl,
    memberCount: room.memberCount,
    targetId: room.peerUserId ?? null,
    lastEventType: mapLastEventType(room.lastMessageType),
    lastEventText: room.lastMessage,
    lastEventAt: room.lastMessageAt,
    unreadCount: room.unreadCount,
    isPinned: Boolean(room.isPinned),
    isMuted: Boolean(room.isMuted),
    isArchived: Boolean(room.isArchivedByViewer) || room.roomStatus === "archived",
  }));
}
