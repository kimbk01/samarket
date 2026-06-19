import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { formatReplyQuoteForMessage } from "@/lib/community-messenger/message-actions/message-reply-policy";

export type GroupMessageQuotePreview = {
  targetMessageId: string;
  senderLabel: string;
  previewText: string;
};

/** Telegram-style quote block for group timeline. */
export function presentGroupMessageQuote(
  message: Pick<
    CommunityMessengerMessage,
    "replyToMessageId" | "replyPreviewText" | "replySenderLabelSnapshot" | "replyPreviewType"
  >
): GroupMessageQuotePreview | null {
  return formatReplyQuoteForMessage(message);
}

export function groupMessageHasReply(
  message: Pick<CommunityMessengerMessage, "replyToMessageId">
): boolean {
  return Boolean(String(message.replyToMessageId ?? "").trim());
}
