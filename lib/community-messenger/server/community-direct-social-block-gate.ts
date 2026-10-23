/**
 * F-2 — 소셜 차단으로 메시지 전송을 막는 게이트는 **community 일반 1:1** 에만 적용.
 * 거래·주문 채팅은 product_chats / store_orders / chat_domain / commerce direct_key 로 확인하고
 * 해당하면 차단 게이트를 적용하지 않는다(기존 거래·주문 송신 가드만 유지).
 *
 * `chat_domain === null` 만으로 일반 채팅이라고 보지 않는다.
 * 도메인이 불명확하면 차단 검사를 **우회하지 않는다**(fail closed → 게이트 적용).
 */
import { isMessengerCommerceDirectKey } from "@/lib/community-messenger/messenger-room-domain";

export function shouldApplyCommunityDirectSocialBlockGate(input: {
  roomType?: string | null;
  chatDomain?: string | null;
  directKey?: string | null;
  hasProductChatLink: boolean;
  hasStoreOrderLink: boolean;
}): boolean {
  const roomType = typeof input.roomType === "string" ? input.roomType.trim() : "";
  if (roomType === "private_group" || roomType === "open_group") return false;

  if (input.hasProductChatLink || input.hasStoreOrderLink) return false;

  const domain = typeof input.chatDomain === "string" ? input.chatDomain.trim().toLowerCase() : "";
  if (domain === "trade" || domain === "store_order") return false;

  if (isMessengerCommerceDirectKey(input.directKey)) return false;

  /** general_direct · null(커머스 증거 없음) · 기타 미확인 → 차단 게이트 적용 */
  return true;
}
