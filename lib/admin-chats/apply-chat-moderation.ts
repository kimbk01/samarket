/**
 * 15단계: 관리자 채팅방 조치 (roomStatus·조치이력 연동)
 */

import type { ChatModerationActionType } from "@/lib/types/admin-chat";
import { getAdminChatRoomById, setRoomStatus } from "./mock-admin-chat-rooms";
import { addChatModerationLog } from "./mock-chat-moderation-logs";

export interface ApplyChatModerationResult {
  ok: boolean;
  message?: string;
}

export function applyChatModerationAction(
  roomId: string,
  actionType: ChatModerationActionType,
  note: string = ""
): ApplyChatModerationResult {
  const room = getAdminChatRoomById(roomId);
  if (!room) return { ok: false, message: "채팅방을 찾을 수 없습니다." };

  switch (actionType) {
    case "block_room":
      setRoomStatus(roomId, "blocked");
      addChatModerationLog(roomId, "block_room", note);
      return { ok: true };
    case "unblock_room":
      setRoomStatus(roomId, "active");
      addChatModerationLog(roomId, "unblock_room", note);
      return { ok: true };
    case "archive_room":
      setRoomStatus(roomId, "archived");
      addChatModerationLog(roomId, "archive_room", note);
      return { ok: true };
    case "warn":
    case "review_only":
      addChatModerationLog(roomId, actionType, note);
      return { ok: true };
    case "hide_message":
      addChatModerationLog(roomId, "hide_message", note);
      return { ok: true };
    default:
      return { ok: false, message: "지원하지 않는 처리입니다." };
  }
}
