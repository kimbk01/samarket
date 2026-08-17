import { redirect } from "next/navigation";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";

/** CUT E — legacy purchase list → Messenger trade chat list. */
export default function MypagePurchasesLegacyRedirectPage() {
  redirect(TRADE_CHAT_MESSENGER_LIST_HREF);
}
