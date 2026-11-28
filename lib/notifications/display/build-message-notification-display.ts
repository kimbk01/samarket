import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildCanonicalNotificationRoomHref } from "@/lib/chat-domain/push/canonical-notification-room-route";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  TRADE_CHAT_PREVIEW_TOKEN_MESSAGE,
  tradeChatStoredPreviewText,
} from "@/lib/trade/trade-api-error-text";
import { buildTradeLegacyChatWebPath } from "@/lib/notifications/policy/notification-deeplink-policy";

export type MessageNotificationPreviewKind =
  | "text"
  | "image"
  | "sticker"
  | "voice"
  | "video"
  | "file"
  | "location"
  | "hidden";

export type MessageNotificationDisplayPayload = {
  senderName: string;
  senderAvatarUrl: string | null;
  roomKind: NotificationMessageRoomKind;
  roomName: string | null;
  contextLabel: string | null;
  previewText: string;
  previewKind: MessageNotificationPreviewKind;
  privacyRedacted: boolean;
  routeUrl: string;
  title: string;
  body: string;
  /** Four-domain envelope — push / Bell / deep-link SSOT */
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
};

export type BuildMessageNotificationDisplayInput = {
  language: AppLanguageCode;
  chatPreviewEnabled: boolean;
  roomKind: NotificationMessageRoomKind;
  messageType?: string | null;
  textContent?: string | null;
  /** Caller preview fallback when DB row unavailable. */
  previewFallback?: string | null;
  sender: { displayName: string; avatarUrl: string | null };
  room: { name: string | null; contextLabel: string | null };
  roomId: string;
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
  /**
   * 본문 앞 「보낸 사람: 」을 붙이지 않는다 — 모임 방에서 보낸 사람의 모임 프로필을 모를 때(앱 안 배너 · 모임 R5 A14).
   * 기본 false 라 다른 호출처는 그대로다.
   */
  omitSenderPrefix?: boolean;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function resolveMessageNotificationPreviewKind(
  messageType: string | null | undefined,
  textContent?: string | null
): MessageNotificationPreviewKind {
  const mt = trimText(messageType).toLowerCase();
  if (!mt || mt === "text") {
    const text = trimText(textContent);
    if (text.startsWith("📍") || /위치\s*공유|Location/i.test(text)) return "location";
    return "text";
  }
  /** D5(2026-11-16 실기): 스티커가 「사진을 보냈습니다」, 음성이 「새 메시지」로 왔다 — 종류별 문구 */
  if (mt === "image") return "image";
  if (mt === "sticker") return "sticker";
  if (mt === "voice") return "voice";
  if (mt === "video") return "video";
  if (mt === "file") return "file";
  if (mt === "location") return "location";
  return "hidden";
}

function resolvePreviewText(
  language: AppLanguageCode,
  previewKind: MessageNotificationPreviewKind,
  textContent: string | null | undefined,
  previewFallback: string | null | undefined,
  privacyRedacted: boolean
): string {
  if (privacyRedacted) {
    return notifySafeT(language, "notify_preview_new_message");
  }
  switch (previewKind) {
    case "image":
      return notifySafeT(language, "notify_preview_sent_photo");
    case "sticker":
      return notifySafeT(language, "notify_preview_sent_sticker");
    case "voice":
      return notifySafeT(language, "notify_preview_sent_voice");
    case "video":
      return notifySafeT(language, "notify_preview_sent_video");
    case "file":
      return notifySafeT(language, "notify_preview_sent_file");
    case "location":
      return notifySafeT(language, "notify_preview_shared_location");
    case "hidden":
      return notifySafeT(language, "notify_preview_new_message");
    case "text":
    default: {
      /** 거래 채팅 저장 토큰(「(메시지)」·미리보기 「사진」「거래 상태 안내」 등) → 받는 사람 언어. 회원 글은 그대로 */
      const tr = (key: MessageKey, vars?: Record<string, string | number>) =>
        notifySafeT(language, key, vars ? { vars } : undefined);
      const fromContent = trimText(textContent);
      if (fromContent) {
        const shown = fromContent === TRADE_CHAT_PREVIEW_TOKEN_MESSAGE ? tradeChatStoredPreviewText(fromContent, tr) : fromContent;
        return shown.slice(0, 200);
      }
      const fromFallback = trimText(previewFallback);
      if (fromFallback) return tradeChatStoredPreviewText(fromFallback, tr).slice(0, 200);
      return notifySafeT(language, "notify_preview_new_message");
    }
  }
}

export function resolveMessageNotificationRouteUrl(
  roomKind: NotificationMessageRoomKind,
  roomId: string
): string {
  const id = roomId.trim();
  if (!id) return "/community-messenger";
  switch (roomKind) {
    case "group":
      return (
        buildCanonicalNotificationRoomHref({ roomId: id, chatDomain: "group" }) ??
        "/community-messenger"
      );
    case "trade_legacy":
      return buildTradeLegacyChatWebPath(id);
    case "trade":
      return (
        buildCanonicalNotificationRoomHref({ roomId: id, chatDomain: "trade" }) ??
        "/community-messenger"
      );
    case "store_order":
      return (
        buildCanonicalNotificationRoomHref({ roomId: id, chatDomain: "store_order" }) ??
        "/community-messenger"
      );
    case "direct":
    default:
      return (
        buildCanonicalNotificationRoomHref({ roomId: id, chatDomain: "general_direct" }) ??
        "/community-messenger"
      );
  }
}

function buildTitleBody(input: {
  language: AppLanguageCode;
  roomKind: NotificationMessageRoomKind;
  senderName: string;
  roomName: string | null;
  contextLabel: string | null;
  previewText: string;
  privacyRedacted: boolean;
  omitSenderPrefix?: boolean;
}): { title: string; body: string } {
  const senderName = input.senderName || notifySafeT(input.language, "notify_peer_fallback");
  const previewText = input.previewText;
  const roomName = trimText(input.roomName) || notifySafeT(input.language, "notify_group_fallback");
  const contextLabel = trimText(input.contextLabel);

  if (input.roomKind === "group") {
    return {
      title: roomName,
      body: input.privacyRedacted || input.omitSenderPrefix ? previewText : `${senderName}: ${previewText}`,
    };
  }

  if (input.roomKind === "trade" || input.roomKind === "trade_legacy" || input.roomKind === "store_order") {
    const title = contextLabel || senderName;
    const body = input.privacyRedacted
      ? previewText
      : contextLabel
        ? `${senderName}: ${previewText}`
        : previewText;
    return { title, body };
  }

  return {
    title: senderName,
    body: previewText,
  };
}

export function buildMessageNotificationDisplay(
  input: BuildMessageNotificationDisplayInput
): MessageNotificationDisplayPayload {
  const senderName = trimText(input.sender.displayName) || notifySafeT(input.language, "notify_peer_fallback");
  const previewKind = resolveMessageNotificationPreviewKind(input.messageType, input.textContent);
  const privacyRedacted = input.chatPreviewEnabled === false || previewKind === "hidden";
  const previewText = resolvePreviewText(
    input.language,
    previewKind,
    input.textContent,
    input.previewFallback,
    privacyRedacted
  );
  const routeUrl = resolveMessageNotificationRouteUrl(input.roomKind, input.roomId);
  const { title, body } = buildTitleBody({
    language: input.language,
    roomKind: input.roomKind,
    senderName,
    roomName: input.room.name,
    contextLabel: input.room.contextLabel,
    previewText,
    privacyRedacted,
    omitSenderPrefix: input.omitSenderPrefix === true,
  });

  return {
    senderName,
    senderAvatarUrl: trimText(input.sender.avatarUrl) || null,
    roomKind: input.roomKind,
    roomName: trimText(input.room.name) || null,
    contextLabel: trimText(input.room.contextLabel) || null,
    previewText,
    previewKind,
    privacyRedacted,
    routeUrl,
    title,
    body,
    chatDomain: trimText(input.chatDomain) || null,
    domainIdentityKey: trimText(input.domainIdentityKey) || null,
  };
}
