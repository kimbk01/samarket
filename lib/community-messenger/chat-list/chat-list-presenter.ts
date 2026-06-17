import { chatListRoomTypeBadge } from "@/lib/community-messenger/chat-list/chat-room-type";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type ChatListRowViewModel = {
  roomId: string;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  peerUserId: string | null;
  badge: ReturnType<typeof chatListRoomTypeBadge>;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  sendPending: boolean;
  sendFailed: boolean;
};

type PresentChatListRowInput = {
  room: CommunityMessengerRoomSummary;
  preview: string;
  sendPending?: boolean;
  sendFailed?: boolean;
};

export function presentChatListRow(input: PresentChatListRowInput): ChatListRowViewModel {
  const { room, preview } = input;
  const badge = chatListRoomTypeBadge(room);
  const subtitle =
    room.roomType === "direct"
      ? room.subtitle?.trim() || null
      : room.subtitle?.trim() || null;

  return {
    roomId: room.id,
    title: room.title,
    subtitle,
    avatarUrl: room.avatarUrl ?? null,
    peerUserId: room.peerUserId ?? null,
    badge,
    lastMessagePreview: preview,
    lastMessageAt: room.lastMessageAt,
    unreadCount: Math.max(0, room.unreadCount),
    isPinned: Boolean(room.isPinned),
    isMuted: Boolean(room.isMuted),
    isArchived: Boolean(room.isArchivedByViewer) || room.roomStatus === "archived",
    sendPending: Boolean(input.sendPending),
    sendFailed: Boolean(input.sendFailed),
  };
}
