import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import { MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC } from "@/lib/community-messenger/message-actions/message-delete-policy";

/** 텍스트 수정 허용 시간(초) — 모두에게 삭제와 동일 24시간 */
export const MESSAGE_EDIT_MAX_AGE_SEC = MESSAGE_DELETE_FOR_EVERYONE_MAX_AGE_SEC;

export function canEditMessageText(
  message: Pick<
    CommunityMessengerMessage,
    "isMine" | "messageType" | "pending" | "createdAt" | "deletedForEveryoneAt"
  >,
  _roomKind: MessageRoomKindForActions,
  nowMs: number = Date.now()
): boolean {
  if (message.pending) return false;
  if (!message.isMine) return false;
  if (message.messageType !== "text") return false;
  if (message.deletedForEveryoneAt) return false;
  const created = Date.parse(message.createdAt);
  if (!Number.isFinite(created)) return false;
  if (nowMs - created > MESSAGE_EDIT_MAX_AGE_SEC * 1000) return false;
  return true;
}
