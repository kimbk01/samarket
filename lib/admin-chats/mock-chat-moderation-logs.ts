/**
 * 15단계: 채팅 조치 이력 mock (Supabase 연동 시 교체)
 */

import type { ChatModerationLog, ChatModerationActionType } from "@/lib/types/admin-chat";

const ADMIN_ID = "admin";
const ADMIN_NICKNAME = "관리자";

export const MOCK_CHAT_MODERATION_LOGS: ChatModerationLog[] = [];

export function addChatModerationLog(
  roomId: string,
  actionType: ChatModerationActionType,
  note: string = ""
): ChatModerationLog {
  const log: ChatModerationLog = {
    id: `cml-${Date.now()}`,
    roomId,
    actionType,
    adminId: ADMIN_ID,
    adminNickname: ADMIN_NICKNAME,
    note: note.trim(),
    createdAt: new Date().toISOString(),
  };
  MOCK_CHAT_MODERATION_LOGS.push(log);
  return log;
}

export function getChatModerationLogsByRoomId(roomId: string): ChatModerationLog[] {
  return MOCK_CHAT_MODERATION_LOGS.filter((l) => l.roomId === roomId);
}
