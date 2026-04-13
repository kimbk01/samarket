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
 *
 * - **목록**: 메신저 `messengerListHref`.
 * - **방 상세(일반)**: `TRADE_CHAT_MESSENGER_ROOM_BASE/[roomId]` — 커뮤니티 메신저 셸.
 * - **후기 자동 오픈(`?review=1`)**: `ChatDetailView` 전용이라 `/chats/[roomId]` 유지 (`tradeHubChatRoomHref` 의 `review` 옵션).
 * - **compose**: `composePath` (거래 허브 하위).
 */

/** 거래 채팅 목록 단일 진입 — 메신저 */
export const TRADE_CHAT_MESSENGER_LIST_HREF = "/community-messenger?section=chats&kind=trade";

/** 거래 1:1 방 — 메신저 앱 라우트 (`/community-messenger/rooms/[roomId]`) */
export const TRADE_CHAT_MESSENGER_ROOM_BASE = "/community-messenger/rooms";

export const TRADE_CHAT_SURFACE = {
  id: "trade",
  hubTabLabel: "거래채팅",
  hubTabLabelKey: "nav_chat_trade",
  /** 거래 채팅 목록(메신저). 링크·리다이렉트는 이 값 사용. */
  messengerListHref: TRADE_CHAT_MESSENGER_LIST_HREF,
  /** 레거시 거래 허브 경로 — compose·리다이렉트 소스만 (방 상세 링크는 `tradeHubChatRoomHref` 사용). */
  hubPath: "/mypage/trade/chat",
  composePath: "/mypage/trade/chat/compose",
  listEmptyMessage: "받은 거래채팅이 없어요.",
  listEmptyMessageKey: "nav_chat_trade_empty",
  emptyCtaHref: "/home",
  emptyCtaLabel: "거래 둘러보기",
  emptyCtaLabelKey: "nav_chat_trade_cta",
} as const;

/**
 * 메신저 거래 방 URL. 알림·딥링크·`defaultTradeChatRoomHref` 와 동일 규칙.
 */
export function tradeMessengerRoomHref(roomId: string, sourceHint?: ChatRoomSource | null): string {
  const id = roomId.trim();
  if (!id) return TRADE_CHAT_MESSENGER_LIST_HREF;
  const base = `${TRADE_CHAT_MESSENGER_ROOM_BASE}/${encodeURIComponent(id)}`;
  return appendTradeHubRoomSourceQuery(base, sourceHint);
}

/**
 * 거래 채팅 방 진입 — 기본은 메신저 방. `review: true` 는 후기 시트 자동 오픈용으로 `/chats` + `ChatRoomScreen` 유지.
 * `source` 는 부트스트랩 힌트(거래 어댑터·프리웜 등)로 URL 에 실을 수 있음.
 */
export function tradeHubChatRoomHref(
  roomId: string,
  sourceHint?: ChatRoomSource | null,
  opts?: { review?: boolean }
): string {
  const id = roomId.trim();
  if (!id) return TRADE_CHAT_MESSENGER_LIST_HREF;
  if (opts?.review) {
    const base = `/chats/${encodeURIComponent(id)}`;
    let href = appendTradeHubRoomSourceQuery(base, sourceHint);
    const u = new URL(href, "https://samarket.local");
    u.searchParams.set("review", "1");
    return `${u.pathname}${u.search}`;
  }
  return tradeMessengerRoomHref(id, sourceHint);
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
