import type { ChatRoomSource } from "@/lib/types/chat";

/**
 * 거래채팅(상품·중고거래) 표면 — 문구·경로·API `segment=trade` 단일 출처.
 */

export const TRADE_CHAT_SURFACE = {
  id: "trade",
  hubTabLabel: "거래채팅",
  hubTabLabelKey: "nav_chat_trade",
  /** 거래 허브(`/mypage/trade`) 안의 채팅 탭 — 목록·상세 단일 메인 */
  hubPath: "/mypage/trade/chat",
  composePath: "/mypage/trade/chat/compose",
  listEmptyMessage: "받은 거래채팅이 없어요.",
  listEmptyMessageKey: "nav_chat_trade_empty",
  emptyCtaHref: "/home",
  emptyCtaLabel: "거래 둘러보기",
  emptyCtaLabelKey: "nav_chat_trade_cta",
} as const;

/** 거래 허브 안 채팅 상세 — 알림·구매/판매 상세·홈 시트가 동일 `ChatRoomScreen` 으로 열리도록 경로 단일화 */
export function tradeHubChatRoomHref(roomId: string): string {
  const id = roomId.trim();
  return `${TRADE_CHAT_SURFACE.hubPath}/${encodeURIComponent(id)}`;
}

export function tradeHubChatComposeHref(input: {
  productId?: string | null;
  roomId?: string | null;
  sourceHint?: ChatRoomSource | null;
}): string {
  const q = new URLSearchParams();
  const productId = input.productId?.trim();
  const roomId = input.roomId?.trim();
  if (productId) q.set("productId", productId);
  if (roomId) q.set("roomId", roomId);
  if (input.sourceHint === "chat_room" || input.sourceHint === "product_chat") {
    q.set("source", input.sourceHint);
  }
  const qs = q.toString();
  return qs ? `${TRADE_CHAT_SURFACE.composePath}?${qs}` : TRADE_CHAT_SURFACE.composePath;
}

export type TradeChatSurface = typeof TRADE_CHAT_SURFACE;
