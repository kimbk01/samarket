/**
 * 거래 채팅 표면 — 문구·경로만 이 파일에서 관리.
 */

export const TRADE_CHAT_SURFACE = {
  id: "trade",
  hubTabLabel: "거래 채팅",
  hubPath: "/chats",
  listEmptyMessage: "거래 채팅이 없어요.",
} as const;

export type TradeChatSurface = typeof TRADE_CHAT_SURFACE;
