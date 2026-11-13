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

/**
 * 「채팅방으로 공유」 끔 (SH-P0-1 · Owner G-18 2026-11-14).
 * 이 메뉴는 실제 전송 없이 원본 방 이름·방 ID·메시지 ID 를 클립보드에 넣어, 붙여넣는 곳에 비공개 방 이름이 노출됐다.
 * 서버 전달 기능(통합 공유 S6)이 승인·구현되기 전까지 어떤 방·메시지에서도 열지 않는다.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §C SH-P0-1 · §J-5.
 */
export function canShareMessageToRoom(
  _message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  _roomKind: MessageRoomKindForActions
): boolean {
  return false;
}

/**
 * 메시지 「링크 복사」 끔 (SH-P0-2 · Owner G-19 2026-11-14).
 * 복사되는 주소(`/community-messenger/rooms/{방ID}?msg={메시지ID}`)는 방 참가자만 열 수 있는 비공개 방 주소라
 * 받는 사람에게 쓸모가 없고, 방 ID 만 바깥으로 나간다. 어떤 방·메시지에서도 열지 않는다.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §C SH-P0-2.
 */
export function canCopyMessageLink(
  _message: Pick<CommunityMessengerMessage, "messageType" | "pending">,
  _roomKind: MessageRoomKindForActions
): boolean {
  return false;
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
