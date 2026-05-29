/**
 * 채팅방 도메인 구분 — 거래/배달 카드는 메신저 목록에서 **표시용 메타**로만 쓰인다.
 * 사용자 대면 「채팅 3종」 정의·Philife·스토어 스트림·통화와의 혼동 금지는
 * `lib/chat-domain/samarket-three-chat-pillars.ts` 를 따른다.
 */

import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export function communityMessengerRoomIsTrade(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "trade") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return true;
  // 키워드 폴백: contextMeta·directKey 가 모두 없을 때만 사용.
  // 단어 경계 정규식으로 "거래처" 등 복합어 오분류 방지.
  // DO NOT: contextMeta 가 있는데 kind 가 다른 방에 이 폴백을 적용하면 필터 정합이 깨진다.
  if (room.contextMeta?.kind || dk) return false;
  const text = `${room.title ?? ""} ${room.summary ?? ""} ${room.subtitle ?? ""}`;
  return /(?<![가-힣])거래(?![가-힣])/.test(text);
}

export function communityMessengerRoomIsDelivery(room: CommunityMessengerRoomSummary): boolean {
  if (room.contextMeta?.kind === "delivery") return true;
  const dk = room.messengerDirectKey?.trim() ?? "";
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return false;
  if (dk.startsWith("store_order:")) return true;
  if (dk.startsWith("trade_order:")) return true;
  // 키워드 폴백: contextMeta·directKey 가 모두 없을 때만 사용.
  // "주문" 단어는 일반 대화에서도 쓰이므로 "배달"만 단독 검사, "주문" 은 더 좁은 맥락에서만.
  if (room.contextMeta?.kind || dk) return false;
  const text = `${room.title ?? ""} ${room.summary ?? ""} ${room.subtitle ?? ""}`;
  return /(?<![가-힣])배달(?![가-힣])/.test(text) || /배달[^\s]*주문|주문[^\s]*배달/.test(text);
}

/**
 * 메신저 채팅 탭 목록에서 1:1 행을 합칠 때의 그룹 키.
 * 거래·배달 맥락이 있는 방은 **동일 peer 의 친구 DM 과 합치지 않음** —
 * 그렇지 않으면 `kind=trade` 필터에서 줄이 사라지고 item_trade 쪽 미읽음 뱃지만 남는 정합 깨짐이 난다.
 */
export function messengerDirectThreadListCollapseKey(room: CommunityMessengerRoomSummary): string {
  if (room.roomType !== "direct") return `id:${room.id}`;
  const peer = room.peerUserId?.trim();
  if (!peer) return `id:${room.id}`;
  if (communityMessengerRoomIsTrade(room) || communityMessengerRoomIsDelivery(room)) {
    return `id:${room.id}`;
  }
  return `direct:${peer}`;
}
