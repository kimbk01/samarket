/**
 * 거래채팅(상품·중고거래) 표면 — 문구·경로·API `segment=trade` 단일 출처.
 */

export const TRADE_CHAT_SURFACE = {
  id: "trade",
  hubTabLabel: "거래채팅",
  /** 거래 허브(`/mypage/trade`) 안의 채팅 탭 — 목록·상세 단일 메인 */
  hubPath: "/mypage/trade/chat",
  listEmptyMessage: "받은 거래채팅이 없어요.",
  emptyCtaHref: "/home",
  emptyCtaLabel: "거래 둘러보기",
} as const;

export type TradeChatSurface = typeof TRADE_CHAT_SURFACE;
