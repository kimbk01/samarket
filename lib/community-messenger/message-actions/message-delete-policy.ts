import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

/** 모두에게 삭제 허용 시간(초) — 기본 24시간 */
export const MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC = 24 * 60 * 60;

export function canDeleteMessageForMe(
  message: Pick<CommunityMessengerMessage, "isMine" | "messageType" | "pending">,
  _roomKind: MessageRoomKindForActions
): boolean {
  if (message.pending) return false;
  if (!message.isMine) return false;
  if (message.messageType === "system") return false;
  return true;
}

export function canDeleteMessageForEveryone(
  message: Pick<CommunityMessengerMessage, "isMine" | "messageType" | "pending" | "createdAt">,
  roomKind: MessageRoomKindForActions,
  nowMs: number = Date.now()
): boolean {
  if (!canDeleteMessageForMe(message, roomKind)) return false;
  if (message.messageType === "call_stub") return false;
  const created = Date.parse(message.createdAt);
  if (!Number.isFinite(created)) return false;
  if (nowMs - created > MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC * 1000) return false;
  return true;
}
