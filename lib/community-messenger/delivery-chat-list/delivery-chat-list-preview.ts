import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { DeliveryChatListTranslate } from "@/lib/community-messenger/delivery-chat-list/view-model";

function messengerMessageToPreviewSnippet(
  msg: CommunityMessengerMessage,
  t: DeliveryChatListTranslate
): string {
  const type = msg.messageType ?? "text";
  const content = (msg.content ?? "").trim();
  if (type === "image") return t("cm_ui_photo");
  if (type === "voice") return t("cm_ui_voice_message");
  if (type === "sticker") return t("cm_ui_sticker");
  if (type === "file") return content || t("chats_trade_list_file");
  if (type === "call_stub") {
    if (!content) return t("chats_trade_list_call");
    return content.includes("통화") || content.toLowerCase().includes("call")
      ? content
      : `${t("chats_trade_list_call")} · ${content}`;
  }
  if (type === "system") return content || t("chats_trade_list_notification");
  return content || t("chats_trade_list_new_message");
}

/** bootstrap preview + Realtime 최신 메시지 병합 */
export function buildDeliveryChatListPreviewLine(args: {
  listPreview: string;
  storeName: string;
  lastClientMessage: CommunityMessengerMessage | null | undefined;
  t: DeliveryChatListTranslate;
}): string {
  const bootstrap = args.listPreview.trim();
  const msg = args.lastClientMessage;
  if (!msg) return bootstrap || args.t("chats_trade_list_new_message");
  const snippet = messengerMessageToPreviewSnippet(msg, args.t);
  const who = msg.isMine
    ? args.t("chats_trade_list_preview_me")
    : args.storeName.trim() || args.t("chats_trade_list_peer_fallback");
  const live = `${who}: ${snippet}`;
  return live.trim() || bootstrap;
}
