/**
 * 채팅 채널 분리
 * - 거래 채팅(상품·DM·커뮤니티 룸): API `/api/chat/*` + 아래 이벤트로만 미읽음 갱신
 * - 주문 채팅: `shared-order-chat/shared-chat-store` + `subscribeOrderChat` / `useOrderChatVersion` 만 사용 (이 이벤트와 무관)
 */

/** 통합 채팅 미읽음 변경(거래·커뮤니티·매장 주문) — 하단 탭 배지·목록 즉시 갱신 */
export const KASAMA_TRADE_CHAT_UNREAD_UPDATED = "kasama:trade-chat-unread-updated";

/** 매장 접수·환불 카운트 등 오너 허브 배지 즉시 갱신 */
export const KASAMA_OWNER_HUB_BADGE_REFRESH = "kasama:owner-hub-badge-refresh";

/** 주문 제출 후 매장 탭「내 주문」배지 — `StoresHub` 가 주문 목록 재조회 */
export const KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH = "kasama:buyer-store-orders-hub-refresh";

/** 관리자 메인 하단 탭 설정 저장 — `BottomNav` 가 즉시 재조회 */
export const KASAMA_MAIN_BOTTOM_NAV_UPDATED = "kasama:main-bottom-nav-updated";
