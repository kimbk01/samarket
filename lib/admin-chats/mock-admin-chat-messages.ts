/**
 * 15단계: 관리자 채팅 메시지 (6단계 MOCK_CHAT_MESSAGES 기반)
 */

import type { AdminChatMessage } from "@/lib/types/admin-chat";
import { MOCK_CHAT_MESSAGES } from "@/lib/chats/mock-chat-messages";
import { getNickname } from "@/lib/admin-reports/mock-user-moderation";

const HIDDEN_MSG_IDS = new Set<string>();
const REPORTED_MSG_IDS = new Set<string>();

function toAdminMessage(m: {
  id: string;
  roomId: string;
  senderId: string;
  message: string;
  createdAt: string;
}): AdminChatMessage {
  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId,
    senderNickname: getNickname(m.senderId),
    messageType: "text",
    message: m.message,
    createdAt: m.createdAt,
    isReported: REPORTED_MSG_IDS.has(m.id),
    isHidden: HIDDEN_MSG_IDS.has(m.id),
  };
}

export function getAdminMessages(roomId: string): AdminChatMessage[] {
  return MOCK_CHAT_MESSAGES.filter((m) => m.roomId === roomId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(toAdminMessage);
}

export function setMessageHidden(messageId: string, hidden: boolean): void {
  if (hidden) HIDDEN_MSG_IDS.add(messageId);
  else HIDDEN_MSG_IDS.delete(messageId);
}

export function setMessageReported(messageId: string, reported: boolean): void {
  if (reported) REPORTED_MSG_IDS.add(messageId);
  else REPORTED_MSG_IDS.delete(messageId);
}
