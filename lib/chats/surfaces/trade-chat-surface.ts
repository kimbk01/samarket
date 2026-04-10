import type { ChatRoomSource } from "@/lib/types/chat";

function appendTradeHubRoomSourceQuery(
  href: string,
  sourceHint?: ChatRoomSource | null
): string {
  if (sourceHint !== "chat_room" && sourceHint !== "product_chat") return href;
  const u = new URL(href, "https://samarket.local");
  u.searchParams.set("source", sourceHint);
  return `${u.pathname}${u.search}`;
}

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

/**
 * 거래 허브 안 채팅 상세 — 알림·구매/판매 상세·홈 시트가 동일 `ChatRoomScreen` 으로 열리도록 경로 단일화.
 * `source` 를 넘기면 RSC·`/bootstrap` 이 상세·메시지 로드를 병렬화하고 레거시/통합 이중 조회를 피함.
 */
export function tradeHubChatRoomHref(
  roomId: string,
  sourceHint?: ChatRoomSource | null,
  opts?: { review?: boolean }
): string {
  const id = roomId.trim();
  const base = `${TRADE_CHAT_SURFACE.hubPath}/${encodeURIComponent(id)}`;
  let href = appendTradeHubRoomSourceQuery(base, sourceHint);
  if (opts?.review) {
    const u = new URL(href, "https://samarket.local");
    u.searchParams.set("review", "1");
    href = `${u.pathname}${u.search}`;
  }
  return href;
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
