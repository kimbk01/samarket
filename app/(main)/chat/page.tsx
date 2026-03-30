import { redirect } from "next/navigation";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

/** 채팅 목록 메인 — 거래 허브 채팅 탭 */
export default function ChatPage() {
  redirect(TRADE_CHAT_SURFACE.hubPath);
}
