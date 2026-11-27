import type { CommunityMessengerMessage, CommunityMessengerMessageType } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import type { MessageKey } from "@/lib/i18n/messages";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";

/** 화면 문구 번역 — React 화면은 `useI18n().t`, 생략하면 현재 화면 언어(`translateCmUi`) */
export type ReplyPolicyTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

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

/**
 * 원문이 전원 삭제된 경우의 **저장·비교 토큰** — 방 목록 마지막 메시지 저장값·병합 판정(`messenger-message-merge-authority`)이
 * 이 값으로 맞춰져 있어 토큰은 바꾸지 않는다. 화면에 그릴 때는 `resolveStoredMessagePlaceholderKey` 로 키를 얻어 `t()` 한다.
 */
const DELETED_MESSAGE_PLACEHOLDER_TOKEN = "삭제된 메시지입니다";
/** 관리자 숨김(`is_hidden_by_admin`) 메시지의 저장·비교 토큰 (원문은 DB 에 보존, 해제 시 복원) */
const ADMIN_HIDDEN_MESSAGE_PLACEHOLDER_TOKEN = "운영 정책에 따라 가려진 메시지입니다";

export function resolveDeletedMessagePlaceholder(_message?: CommunityMessengerMessage): string {
  void _message;
  return DELETED_MESSAGE_PLACEHOLDER_TOKEN;
}

export function resolveAdminHiddenMessagePlaceholder(): string {
  return ADMIN_HIDDEN_MESSAGE_PLACEHOLDER_TOKEN;
}

/** 저장된 삭제·숨김 대체 토큰(옛 행 포함) → 화면 문구 키. 사람이 쓴 글이면 null(그대로 그림) */
export function resolveStoredMessagePlaceholderKey(
  text: string | null | undefined
): "cm_ui_message_deleted_placeholder" | "cm_ui_message_admin_hidden_placeholder" | null {
  const v = String(text ?? "").trim();
  if (v === DELETED_MESSAGE_PLACEHOLDER_TOKEN) return "cm_ui_message_deleted_placeholder";
  if (v === ADMIN_HIDDEN_MESSAGE_PLACEHOLDER_TOKEN) return "cm_ui_message_admin_hidden_placeholder";
  return null;
}

/** 답장 말풍선 상단 인용 블록 — `reply_to_message_id` 가 있을 때만 */
export function formatReplyQuoteForMessage(
  item: Pick<
    CommunityMessengerMessage,
    "replyToMessageId" | "replyPreviewText" | "replySenderLabelSnapshot" | "replyPreviewType"
  >,
  t: ReplyPolicyTranslate = translateCmUi
): { targetMessageId: string; senderLabel: string; previewText: string } | null {
  const targetMessageId = String(item.replyToMessageId ?? "").trim();
  if (!targetMessageId) return null;
  const senderLabel = String(item.replySenderLabelSnapshot ?? "").trim() || t("cm_svc_message_default");
  let previewText = String(item.replyPreviewText ?? "").trim();
  const storedPlaceholderKey = resolveStoredMessagePlaceholderKey(previewText);
  if (storedPlaceholderKey) previewText = t(storedPlaceholderKey);
  if (!previewText) {
    const previewType = String(item.replyPreviewType ?? "").trim();
    previewText = previewType ? `(${previewType})` : t("cm_ui_message_deleted_placeholder");
  }
  return { targetMessageId, senderLabel, previewText: previewText.slice(0, 280) };
}

/** 카카오톡 스타일 답장 인용 상단 라벨 (예: BK Kim에게 답장) */
export function formatReplyQuoteKakaoHeader(senderLabel: string, t: ReplyPolicyTranslate = translateCmUi): string {
  const label = String(senderLabel ?? "").trim() || t("cm_svc_message_default");
  return t("cm_ui_reply_to", { label });
}
