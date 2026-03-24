/**
 * 6단계: 채팅 메시지 mock (Supabase Realtime 연동 시 교체)
 */

import type { ChatMessage } from "@/lib/types/chat";
import { updateRoomLastMessage } from "./mock-chat-rooms";

export const MOCK_CHAT_MESSAGES: ChatMessage[] = [
  { id: "m1", roomId: "room-1", senderId: "s1", message: "안녕하세요, 문의 주신 아이폰이에요.", createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), isRead: true },
  { id: "m2", roomId: "room-1", senderId: "me", message: "네, 내일 오후에 보러 가도 될까요?", createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), isRead: true },
  { id: "m3", roomId: "room-1", senderId: "s1", message: "네, 내일 오후에 가능해요.", createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), isRead: true },
  { id: "m4", roomId: "room-2", senderId: "me", message: "가격 조금만 깎아주실 수 있을까요?", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), isRead: true },
  { id: "m5", roomId: "room-3", senderId: "b1", message: "에어팟 아직 판매 중이에요?", createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), isRead: false },
];

export function getMessages(roomId: string): ChatMessage[] {
  return MOCK_CHAT_MESSAGES.filter((m) => m.roomId === roomId).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function sendMessage(
  roomId: string,
  senderId: string,
  message: string
): ChatMessage {
  const now = new Date().toISOString();
  const newMsg: ChatMessage = {
    id: `m-${Date.now()}`,
    roomId,
    senderId,
    message: message.trim(),
    createdAt: now,
    isRead: false,
  };
  MOCK_CHAT_MESSAGES.push(newMsg);
  updateRoomLastMessage(roomId, newMsg.message, now);
  return newMsg;
}
