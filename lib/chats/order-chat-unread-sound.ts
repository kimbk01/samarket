import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";

/** 매장 주문 채팅 미읽음이 늘었을 때 — Realtime·채팅 폴링과 동일 이벤트 중복 재생 방지 */
export function playOrderChatUnreadDebounced(prevTotal: number, nextTotal: number): void {
  playCoalescedChatNotificationSound(`order-unread:${prevTotal}->${nextTotal}`);
}
