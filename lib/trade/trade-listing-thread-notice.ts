import type { ChatMessage } from "@/lib/types/chat";

/** 판매 단계 변경 시 거래 스레드(통합 chat_messages / 레거시 product_chat_messages)에 기록되는 시스템 안내 */
export type TradeListingThreadNotice = {
  channel: "integrated" | "legacy_product_chat";
  message: ChatMessage;
};
