import type { CreateOrGetChatRoomResult } from "@/lib/chat/createOrGetChatRoom";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";

/**
 * 거래 상세 CTA에서 사용하는 메신저 채팅 진입 서비스.
 * 기존 createOrGetChatRoom 계약을 유지하고 상세 도메인에서만 의미를 명확히 한다.
 */
export async function createOrGetTradeMessengerChatRoom(input: {
  itemId: string;
}): Promise<CreateOrGetChatRoomResult> {
  return createOrGetChatRoom(input.itemId);
}
