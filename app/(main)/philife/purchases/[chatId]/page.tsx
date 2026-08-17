import { redirect } from "next/navigation";
import { tradeHubChatRoomHref } from "@/lib/chats/surfaces/trade-chat-surface";
import { parseRoomId } from "@/lib/validate-params";

interface PageProps {
  params: Promise<{ chatId: string }>;
}

/** CUT E — philife purchase detail → Messenger trade room. */
export default async function PhilifePurchaseDetailLegacyRedirectPage({ params }: PageProps) {
  const { chatId: raw } = await params;
  const chatId = parseRoomId(raw);
  if (!chatId) {
    redirect(tradeHubChatRoomHref(""));
  }
  redirect(tradeHubChatRoomHref(chatId, "product_chat"));
}
