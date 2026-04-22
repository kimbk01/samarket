import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

export function canShareMessageExternally(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  roomKind: MessageRoomKindForActions
): boolean {
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  if (roomKind === "trade") return false;
  return true;
}

export function canShareMessageToRoom(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  _roomKind: MessageRoomKindForActions
): boolean {
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  return true;
}

export function canCopyMessageLink(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  roomKind: MessageRoomKindForActions
): boolean {
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  if (roomKind === "trade") return false;
  return true;
}

/** 내부·외부·링크 중 하나라도 가능하면 공유 메뉴를 연다 */
export function canShareMessage(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  roomKind: MessageRoomKindForActions
): boolean {
  return (
    canShareMessageToRoom(message, roomKind) ||
    canShareMessageExternally(message, roomKind) ||
    canCopyMessageLink(message, roomKind)
  );
}
