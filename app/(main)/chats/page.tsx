import { redirect } from "next/navigation";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** 레거시 `/chats` — 거래 채팅 메인은 거래 허브 탭으로 통일 */
export default function ChatsPage() {
  redirect(TRADE_CHAT_SURFACE.hubPath);
}
