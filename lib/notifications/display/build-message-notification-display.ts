import type { AppLanguageCode } from "@/lib/i18n/config";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import {
  buildChatRoomWebPath,
  buildTradeLegacyChatWebPath,
} from "@/lib/notifications/policy/notification-deeplink-policy";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";

export type MessageNotificationPreviewKind =
  | "text"
  | "image"
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
  if (mt === "image" || mt === "sticker") return "image";
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
      const fromContent = trimText(textContent);
      if (fromContent) return fromContent.slice(0, 200);
      const fromFallback = trimText(previewFallback);
      if (fromFallback) return fromFallback.slice(0, 200);
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
      return buildGroupRoomWebPath(id);
    case "trade_legacy":
      return buildTradeLegacyChatWebPath(id);
    case "trade":
    case "store_order":
    case "direct":
    default:
      return buildChatRoomWebPath(id);
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
}): { title: string; body: string } {
  const senderName = input.senderName || notifySafeT(input.language, "notify_peer_fallback");
  const previewText = input.previewText;
  const roomName = trimText(input.roomName) || notifySafeT(input.language, "notify_group_fallback");
  const contextLabel = trimText(input.contextLabel);

  if (input.roomKind === "group") {
    return {
      title: roomName,
      body: input.privacyRedacted ? previewText : `${senderName}: ${previewText}`,
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
