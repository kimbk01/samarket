import { redirect } from "next/navigation";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** 거래 채팅 목록은 메신저 `section=chats&kind=trade` 로 통일 */
export default function TradeChatPage() {
  redirect(TRADE_CHAT_SURFACE.messengerListHref);
}
