/**
 * 메신저 화면 문구(통화 제외).
 * S6(언어 SSOT, 2026-11-08): 코드 안 언어 삼항·문구 쌍·인라인 표에서 옮긴 문구 (`docs/i18n-ssot.md` §3).
 */
export const copyMessengerMessages = {
  ko: {
    community_messenger_loading: "불러오는 중…",
    community_messenger_trade_chats: "거래 채팅",
    community_messenger_order_chats: "주문 채팅",
    community_messenger_domain_shell_canary: "도메인 셸 카나리",
    community_messenger_general: "일반",
    community_messenger_groups: "그룹",
    community_messenger_no_messages: "메시지가 없습니다",
    community_messenger_couldn_t_load_order_chats: "주문 채팅을 불러오지 못했습니다.",
    community_messenger_retry: "다시 시도",
    community_messenger_unreadroomcount_unread: "읽지 않음 {unreadRoomCount}",
    community_messenger_listing_unavailable: "상품 정보를 확인할 수 없습니다",
    community_messenger_couldn_t_load_trade_chats: "거래 채팅을 불러오지 못했습니다.",
  },
  en: {
    community_messenger_loading: "Loading…",
    community_messenger_trade_chats: "Trade chats",
    community_messenger_order_chats: "Order chats",
    community_messenger_domain_shell_canary: "Domain Shell Canary",
    community_messenger_general: "General",
    community_messenger_groups: "Groups",
    community_messenger_no_messages: "No messages",
    community_messenger_couldn_t_load_order_chats: "Couldn’t load order chats.",
    community_messenger_retry: "Retry",
    community_messenger_unreadroomcount_unread: "{unreadRoomCount} unread",
    community_messenger_listing_unavailable: "Listing unavailable",
    community_messenger_couldn_t_load_trade_chats: "Couldn’t load trade chats.",
  },
} as const;
