/**
 * 15단계: 관리자 채팅방 목록/상세 (6단계 MOCK_CHAT_ROOMS 기반)
 */

import type { AdminChatRoom, RoomStatus } from "@/lib/types/admin-chat";
import { MOCK_CHAT_ROOMS } from "@/lib/chats/mock-chat-rooms";
import { MOCK_CHAT_MESSAGES } from "@/lib/chats/mock-chat-messages";
import { MOCK_REPORTS } from "@/lib/reports/mock-reports";
import { getNickname } from "@/lib/admin-reports/mock-user-moderation";

const ROOM_STATUS: Record<string, RoomStatus> = {};
const ADMIN_MEMO: Record<string, string> = {};

function buildAdminRoom(r: (typeof MOCK_CHAT_ROOMS)[0]): AdminChatRoom {
  const messageCount = MOCK_CHAT_MESSAGES.filter((m) => m.roomId === r.id).length;
  const reportCount = MOCK_REPORTS.filter(
    (x) => x.targetType === "chat" && x.targetId === r.id
  ).length;
  const roomStatus = ROOM_STATUS[r.id] ?? (reportCount > 0 ? "reported" : "active");
  return {
    id: r.id,
    productId: r.productId,
    productTitle: r.product.title,
    productThumbnail: r.product.thumbnail ?? "",
    buyerId: r.buyerId,
    buyerNickname: getNickname(r.buyerId),
    sellerId: r.sellerId,
    sellerNickname: getNickname(r.sellerId),
    lastMessage: r.lastMessage,
    lastMessageAt: r.lastMessageAt,
    messageCount,
    reportCount,
    roomStatus,
    createdAt: r.lastMessageAt,
    adminMemo: ADMIN_MEMO[r.id],
  };
}

export function getAdminChatRooms(): AdminChatRoom[] {
  return MOCK_CHAT_ROOMS.map(buildAdminRoom).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function getAdminChatRoomById(roomId: string): AdminChatRoom | undefined {
  const room = MOCK_CHAT_ROOMS.find((r) => r.id === roomId);
  if (!room) return undefined;
  return buildAdminRoom(room);
}

export function getAdminMemo(roomId: string): string {
  return ADMIN_MEMO[roomId] ?? "";
}

export function setAdminMemo(roomId: string, memo: string): void {
  if (memo.trim()) ADMIN_MEMO[roomId] = memo.trim();
  else delete ADMIN_MEMO[roomId];
}

export function setRoomStatus(roomId: string, status: RoomStatus): void {
  ROOM_STATUS[roomId] = status;
}
