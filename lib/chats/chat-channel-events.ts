/**
 * 채팅 채널 분리
 * - 거래 채팅(상품·DM·커뮤니티 룸): API `/api/chat/*` + 아래 이벤트로만 미읽음 갱신
 * - 주문 채팅: `shared-order-chat/shared-chat-store` + `subscribeOrderChat` / `useOrderChatVersion` 만 사용 (이 이벤트와 무관)
 */

/** 거래·일반 채팅방 미읽음 변경 시 — 하단 탭 배지·목록 갱신 전용 */
export const KASAMA_TRADE_CHAT_UNREAD_UPDATED = "kasama:trade-chat-unread-updated";

/** 매장 접수·환불 카운트 등 오너 허브 배지 즉시 갱신 */
export const KASAMA_OWNER_HUB_BADGE_REFRESH = "kasama:owner-hub-badge-refresh";
