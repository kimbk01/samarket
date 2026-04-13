import { PRODUCT_CHAT_ROW_SELECT } from "@/lib/trade/product-chat-select";

/** 관리자 채팅 상세 — `product_chats` 브랜치 */
export const PRODUCT_CHAT_ADMIN_LIST_SELECT = PRODUCT_CHAT_ROW_SELECT;

/** `reports` 테이블 — 채팅방 신고 매핑용 최소 컬럼 */
export const REPORT_ROW_ADMIN_MIN_SELECT =
  "id, reporter_id, reason_code, reason_text, status, created_at";
