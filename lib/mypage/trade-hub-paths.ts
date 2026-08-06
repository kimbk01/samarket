/**
 * Slice 5 — Trade Activity hub paths SSOT.
 * Legacy `/mypage/purchases|sales` list shells redirect here; detail route KEEP.
 */
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
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
  return "/mypage/trade/purchases";
}

export function tradeSalesPath(_mode?: TradeHubLinkMode): string {
  return "/mypage/trade/sales";
}

/** 구매 흐름 상세 — trade hub chat room (product_chat bootstrap) */
export function tradePurchaseDetailPath(_mode: TradeHubLinkMode, chatId: string): string {
  const raw = chatId.trim();
  return tradeHubChatRoomHref(raw, "product_chat");
}

/** Legacy purchase detail URL KEEP (deep links / bookmarks) */
export function tradePurchaseDetailLegacyPath(chatId: string): string {
  return `/mypage/purchases/${encodeURIComponent(chatId.trim())}`;
}
