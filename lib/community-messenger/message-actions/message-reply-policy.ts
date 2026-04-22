import type { CommunityMessengerMessage, CommunityMessengerMessageType } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

/** 답장 프리뷰·인용에 쓰는 짧은 타입 라벨(한국어) */
export function formatReplyPreviewMessageTypeLabel(messageType: CommunityMessengerMessageType): string {
  switch (messageType) {
    case "text":
      return "텍스트";
    case "image":
      return "이미지";
    case "file":
      return "파일";
    case "voice":
      return "음성";
    case "sticker":
      return "스티커";
    case "call_stub":
      return "통화";
    case "system":
      return "시스템";
    default:
      return String(messageType);
  }
}

export type ReplyPreviewSnapshot = {
  messageId: string;
  senderLabel: string;
  previewText: string;
  messageType: CommunityMessengerMessage["messageType"];
};

export function buildReplyPreviewSnapshot(message: CommunityMessengerMessage): ReplyPreviewSnapshot {
  if (message.deletedForEveryoneAt) {
    return {
      messageId: message.id,
      senderLabel: message.senderLabel,
      previewText: resolveDeletedMessagePlaceholder(message),
      messageType: message.messageType,
    };
  }
  const previewText =
    message.messageType === "text"
      ? message.content.trim().slice(0, 200)
      : `(${message.messageType})`;
  return {
    messageId: message.id,
    senderLabel: message.senderLabel,
    previewText,
    messageType: message.messageType,
  };
}

export function canReplyToMessage(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending" | "deletedForEveryoneAt">,
  _roomKind: MessageRoomKindForActions
): boolean {
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  if (message.deletedForEveryoneAt) return false;
  return true;
}

/** 원문이 전원 삭제된 경우 답장 프리뷰·인용에 사용 */
export function resolveDeletedMessagePlaceholder(_message?: CommunityMessengerMessage): string {
  void _message;
  return "삭제된 메시지입니다";
}

/** 답장 말풍선 상단 인용 블록 — `reply_to_message_id` 가 있을 때만 */
export function formatReplyQuoteForMessage(
  item: Pick<
    CommunityMessengerMessage,
    "replyToMessageId" | "replyPreviewText" | "replySenderLabelSnapshot" | "replyPreviewType"
  >
): { targetMessageId: string; senderLabel: string; previewText: string } | null {
  const targetMessageId = String(item.replyToMessageId ?? "").trim();
  if (!targetMessageId) return null;
  const senderLabel = String(item.replySenderLabelSnapshot ?? "").trim() || "메시지";
  let previewText = String(item.replyPreviewText ?? "").trim();
  if (!previewText) {
    const t = String(item.replyPreviewType ?? "").trim();
    previewText = t ? `(${t})` : resolveDeletedMessagePlaceholder();
  }
  return { targetMessageId, senderLabel, previewText: previewText.slice(0, 280) };
}

/** 카카오톡 스타일 답장 인용 상단 라벨 (예: BK Kim에게 답장) */
export function formatReplyQuoteKakaoHeader(senderLabel: string): string {
  const label = String(senderLabel ?? "").trim() || "메시지";
  return `${label}에게 답장`;
}
