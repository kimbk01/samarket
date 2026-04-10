/**
 * 거래 허브 라우트 — 찜·구매·판매·후기 URL 을 한곳에서 맞춤 (문자열 분산 방지)
 */
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
export const MYPAGE_TRADE_FAVORITES_HREF = "/mypage/trade/favorites" as const;

/** 현재 경로에 맞춰 구매·판매·채팅 상세 링크를 같은 “껍데기”로 유지 */
export type TradeHubLinkMode = "trade_shell" | "mypage_legacy" | "home_legacy";

export function tradeHubModeFromPathname(pathname: string): TradeHubLinkMode {
  const p = pathname?.trim() || "";
  if (p.startsWith("/mypage/trade")) return "trade_shell";
  if (p.startsWith("/home/purchases") || p.startsWith("/home/sales")) return "home_legacy";
  return "mypage_legacy";
}

export function tradePurchasesPath(mode: TradeHubLinkMode): string {
  if (mode === "trade_shell") return "/mypage/trade/purchases";
  if (mode === "home_legacy") return "/home/purchases";
  return "/mypage/purchases";
}

export function tradeSalesPath(mode: TradeHubLinkMode): string {
  if (mode === "trade_shell") return "/mypage/trade/sales";
  if (mode === "home_legacy") return "/home/sales";
  return "/mypage/sales";
}

/** 구매 흐름 상세(채팅방) — chatId 는 product_chats 기준(목록 API) — `source=product_chat` 로 부트스트랩 힌트 */
export function tradePurchaseDetailPath(mode: TradeHubLinkMode, chatId: string): string {
  const raw = chatId.trim();
  if (mode === "trade_shell") return tradeHubChatRoomHref(raw, "product_chat");
  const id = encodeURIComponent(raw);
  if (mode === "home_legacy") return `/home/purchases/${id}`;
  return `/mypage/purchases/${id}`;
}
