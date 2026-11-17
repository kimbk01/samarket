/**
 * Slice 5 — Trade Activity hub paths SSOT.
 * CUT E: buyer purchase list → Messenger trade list; detail legacy → room redirect.
 */
import {
  tradeHubChatRoomHref,
  TRADE_CHAT_MESSENGER_LIST_HREF,
} from "@/lib/chats/surfaces/trade-chat-surface";
export const MYPAGE_TRADE_FAVORITES_HREF = "/mypage/trade/favorites" as const;

/** @deprecated dual-shell removed in Slice 5 — always trade_shell */
export type TradeHubLinkMode = "trade_shell" | "mypage_legacy";

export function tradeHubModeFromPathname(pathname: string): TradeHubLinkMode {
  const p = pathname?.trim() || "";
  if (p.startsWith("/mypage/trade")) return "trade_shell";
  // Purchase detail still under /mypage/purchases/[id] — treat as trade_shell for list links
  if (p.startsWith("/mypage/purchases/") && p !== "/mypage/purchases") return "trade_shell";
  return "trade_shell";
}

export function tradePurchasesPath(_mode?: TradeHubLinkMode): string {
  return TRADE_CHAT_MESSENGER_LIST_HREF;
}

export function tradeSalesPath(_mode?: TradeHubLinkMode): string {
  return "/mypage/trade/sales";
}

/**
 * 판매·구매 내역 행 → 거래 채팅방 URL.
 * `/api/my/sales`·`/api/my/purchases` 의 `messengerRoomId`(정규 `community_messenger_rooms.id`)가 있으면
 * 처음부터 그 id 로 연다 — `product_chats.id` 로 열면 URL 이 정규 id 로 바뀌기 전까지 방 안인데도
 * 소리·안 읽음·배너가 날 수 있다. 정규 id 가 없을 때만 기존 `product_chats.id` 경로를 유지한다.
 */
export function tradeHistoryChatRoomHref(row: {
  chatId: string;
  messengerRoomId?: string | null;
}): string {
  const messengerRoomId = row.messengerRoomId?.trim();
  if (messengerRoomId) return tradeHubChatRoomHref(messengerRoomId);
  return tradeHubChatRoomHref(row.chatId.trim(), "product_chat");
}

/** 구매 흐름 상세 — 정규 메신저 방 id 우선, 없으면 product_chat 경로 */
export function tradePurchaseDetailPath(
  _mode: TradeHubLinkMode,
  chatId: string,
  messengerRoomId?: string | null
): string {
  return tradeHistoryChatRoomHref({ chatId, messengerRoomId });
}

/** Legacy purchase detail URL KEEP (deep links / bookmarks) */
export function tradePurchaseDetailLegacyPath(chatId: string): string {
  return `/mypage/purchases/${encodeURIComponent(chatId.trim())}`;
}
