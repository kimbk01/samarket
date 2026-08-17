import { redirect } from "next/navigation";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";

/** CUT E — philife purchase list duplicate surface → Messenger trade chat list. */
export default function PhilifePurchasesLegacyRedirectPage() {
  redirect(TRADE_CHAT_MESSENGER_LIST_HREF);
}
