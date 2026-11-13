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

/**
 * 「전달하기」 가능 여부 (통합 공유 S6 · Owner G-4 2026-11-14).
 * - text·sticker·image·file (사진·파일은 서버가 저장 객체를 대상 방으로 복사 — S6-2). 음성·통화 기록·상품권·시스템·공유 카드 불가.
 * - 거래방 불가. 배달(주문)·모임 방은 서버(`forwardCommunityMessengerMessage`)가 한 번 더 막는다.
 * - 전송 중·삭제된 메시지 불가.
 */
export function canForwardMessage(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending"> & { deletedForEveryoneAt?: string | null },
  roomKind: MessageRoomKindForActions,
  room?: { chatDomain?: string | null } | null
): boolean {
  if (message.pending) return false;
  if (message.deletedForEveryoneAt) return false;
  const t = message.messageType;
  if (t !== "text" && t !== "sticker" && t !== "image" && t !== "file") return false;
  if (roomKind === "trade") return false;
  const domain = room?.chatDomain ?? null;
  if (domain === "trade" || domain === "store_order") return false;
  return true;
}
