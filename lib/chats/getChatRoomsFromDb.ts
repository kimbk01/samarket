"use client";

import type { ChatRoom } from "@/lib/types/chat";
import { fetchChatRoomsBySegment } from "@/lib/chats/fetch-chat-rooms-by-segment";

/**
 * 거래 채팅 목록 — 클라이언트에서 직접 `product_chats` 를 읽지 않고
 * `GET /api/chat/rooms?segment=trade` 와 동일 경로를 쓴다 (통합 `item_trade`·커서형 미읽음·병합과 정합).
 */
export async function getChatRoomsFromDb(currentUserId: string): Promise<ChatRoom[]> {
  if (!currentUserId.trim()) return [];
  const { ok, status, rooms } = await fetchChatRoomsBySegment("trade");
  if (status === 401 || !ok) return [];
  return rooms;
}

/**
 * 채팅방 1건 — `GET /api/chat/room/:roomId` (`loadChatRoomDetailForUser`).
 * `roomId` 는 레거시 `product_chats.id` 또는 통합 `chat_rooms.id` 모두 허용.
 */
export async function getRoomByIdFromDb(roomId: string, currentUserId: string): Promise<ChatRoom | null> {
  if (!currentUserId.trim() || !roomId.trim()) return null;
  try {
    const res = await fetch(`/api/chat/room/${encodeURIComponent(roomId.trim())}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403 || res.status === 404 || !res.ok) return null;
    return (await res.json()) as ChatRoom;
  } catch {
    return null;
  }
}
