/**
 * 레거시 구매 상세 URL(`/mypage/purchases/[chatId]` · `/philife/purchases/[chatId]`) → 거래 채팅방 리다이렉트 목적지.
 * 서버 전용 (RSC 리다이렉트 페이지에서만 import).
 *
 * 열람자가 그 거래의 판매자·구매자이고 정규 메신저 방이 해석되면 처음부터 그 방 id 로 보낸다.
 * 그 외(비로그인·비참여자·해석 실패·서버 설정 없음)는 기존처럼 `product_chats.id` 경로로 보낸다.
 * 판정은 레거시 거래 채팅 리다이렉트 공용 함수(`resolveLegacyTradeChatRedirectHref`) 하나.
 */
import { resolveLegacyTradeChatRedirectHref } from "@/lib/chats/legacy-trade-chat-redirect-server";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { parseRoomId } from "@/lib/validate-params";

export async function resolveLegacyPurchaseDetailRedirectHref(rawChatId: string): Promise<string> {
  const chatId = parseRoomId(rawChatId);
  if (!chatId) return tradeHubChatRoomHref("");
  return resolveLegacyTradeChatRedirectHref(chatId, "product_chat");
}
