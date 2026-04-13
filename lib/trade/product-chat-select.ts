/** `product_chats` — 거래 채팅 행 조회·동기화 공통 (스키마 확장 시 여기만 보강) */
export const PRODUCT_CHAT_ROW_SELECT =
  "id, post_id, seller_id, buyer_id, created_at, updated_at, last_message_at, last_message_preview, trade_flow_status, chat_mode, seller_completed_at, buyer_confirmed_at, review_deadline_at, buyer_confirm_source, unread_count_seller, unread_count_buyer";
