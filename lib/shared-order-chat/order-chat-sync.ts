import type { SharedOrder, SharedOrderStatus } from "@/lib/shared-orders/types";
import { resetSharedOrderChat, syncOrderChatRoomOrderStatus } from "./shared-chat-store";

/** 주문 뮤테이션 직후 호출 — 채팅 시스템 메시지·알림 동기화 */
export function afterSharedOrderMutation(order: SharedOrder, previousStatus: SharedOrderStatus | null) {
  syncOrderChatRoomOrderStatus(order, previousStatus);
}

export { resetSharedOrderChat };
