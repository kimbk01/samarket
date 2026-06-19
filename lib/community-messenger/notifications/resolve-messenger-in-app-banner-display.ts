"use client";

import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { cmStoreOrderHeadline } from "@/lib/community-messenger/cm-home-list-copy";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  buildMessageNotificationDisplay,
  type MessageNotificationPreviewKind,
} from "@/lib/notifications/display/build-message-notification-display";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { peekMessengerInAppBannerMessageRow } from "@/lib/community-messenger/notifications/messenger-in-app-banner-message-cache";

export type MessengerInAppBannerDisplay = {
  title: string;
  preview: string;
  senderName: string | null;
  senderAvatarUrl: string | null;
  roomKind: NotificationMessageRoomKind;
  contextLabel: string | null;
  previewKind: MessageNotificationPreviewKind;
  routeUrl: string;
};

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function resolveRoomKindFromSummary(room: CommunityMessengerRoomSummary | null): NotificationMessageRoomKind {
  if (!room) return "direct";
  if (room.roomType === "private_group" || room.roomType === "open_group") return "group";
  const dk = trimText(room.messengerDirectKey);
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return "trade";
  if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return "store_order";
  if (room.contextMeta?.kind === "delivery") return "store_order";
  if (room.contextMeta?.kind === "trade") return "trade";
  return "direct";
}

function resolveContextLabel(room: CommunityMessengerRoomSummary | null): string | null {
  const meta = room?.contextMeta ?? parseCommunityMessengerRoomContextMeta(room?.summary);
  if (!meta) return null;
  if (meta.kind === "trade") return trimText(meta.headline) || null;
  if (meta.kind === "delivery") {
    const store = trimText(meta.storeDisplayName);
    const orderNo = trimText(meta.orderNo);
    if (store) return cmStoreOrderHeadline(store, orderNo);
    return trimText(meta.headline) || null;
  }
  return trimText(meta.headline) || null;
}

function resolveSenderFromRoomSummary(
  room: CommunityMessengerRoomSummary | null,
  roomKind: NotificationMessageRoomKind
): { displayName: string; avatarUrl: string | null } {
  if (!room) return { displayName: "", avatarUrl: null };
  if (roomKind === "group") {
    return { displayName: trimText(room.ownerLabel) || trimText(room.subtitle), avatarUrl: room.avatarUrl };
  }
  return { displayName: trimText(room.title), avatarUrl: room.avatarUrl };
}

function resolveMessageFields(
  messageRow: Record<string, unknown> | null,
  room: CommunityMessengerRoomSummary | null
): { messageType: string | null; textContent: string | null } {
  if (messageRow) {
    return {
      messageType: trimText(messageRow.message_type) || "text",
      textContent: trimText(messageRow.content) || null,
    };
  }
  const preview = room ? listPreviewFromMessengerMessageRow(messengerSummaryToInsertRow(room)) : null;
  if (!preview) return { messageType: null, textContent: null };
  return {
    messageType: preview.lastMessageType,
    textContent: preview.lastMessage,
  };
}

function messengerSummaryToInsertRow(room: CommunityMessengerRoomSummary): Record<string, unknown> {
  return {
    message_type: room.lastMessageType ?? "text",
    content: room.lastMessage ?? "",
    created_at: room.lastMessageAt ?? new Date().toISOString(),
  };
}

export function resolveMessengerInAppBannerDisplay(args: {
  roomId: string;
  language?: AppLanguageCode;
  chatPreviewEnabled?: boolean;
}): MessengerInAppBannerDisplay {
  const roomId = trimText(args.roomId);
  const language = args.language ?? DEFAULT_APP_LANGUAGE;
  const chatPreviewEnabled = args.chatPreviewEnabled !== false;
  const room = findHomeListRoomRow(peekBootstrapCache(), roomId);
  const messageRow = peekMessengerInAppBannerMessageRow(roomId);
  const roomKind = resolveRoomKindFromSummary(room);
  const sender = resolveSenderFromRoomSummary(room, roomKind);
  const { messageType, textContent } = resolveMessageFields(messageRow, room);
  const contextLabel = resolveContextLabel(room);

  const display = buildMessageNotificationDisplay({
    language,
    chatPreviewEnabled,
    roomKind,
    messageType,
    textContent,
    previewFallback: room?.lastMessage ?? null,
    sender: { displayName: sender.displayName, avatarUrl: sender.avatarUrl },
    room: {
      name: roomKind === "group" ? trimText(room?.title) || null : null,
      contextLabel,
    },
    roomId,
  });

  return {
    title: display.title,
    preview: display.body,
    senderName: display.senderName,
    senderAvatarUrl: display.senderAvatarUrl,
    roomKind: display.roomKind,
    contextLabel: display.contextLabel,
    previewKind: display.previewKind,
    routeUrl: display.routeUrl,
  };
}
