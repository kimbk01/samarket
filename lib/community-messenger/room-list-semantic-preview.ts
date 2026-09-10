/**
 * Canonical room-list tip preview from message type + metadata.
 * Shared contract for client tip patch / UI display / server summarize.
 * Never use URL-extension heuristics — TEXT URLs stay text.
 */
import type { CommunityMessengerMessageType } from "@/lib/community-messenger/types";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageType(raw: string): CommunityMessengerMessageType {
  if (
    raw === "image" ||
    raw === "file" ||
    raw === "system" ||
    raw === "call_stub" ||
    raw === "voice" ||
    raw === "sticker" ||
    raw === "community_post_share" ||
    raw === "gift_certificate"
  ) {
    return raw;
  }
  return "text";
}

/** Locale-stable tip tokens stored in `rooms.last_message` for typed media. */
export const ROOM_LIST_PREVIEW_IMAGE_TOKEN = "사진";
export const ROOM_LIST_PREVIEW_FILE_TOKEN = "파일";
export const ROOM_LIST_PREVIEW_VOICE_TOKEN = "음성 메시지";
export const ROOM_LIST_PREVIEW_STICKER_TOKEN = "스티커";
export const ROOM_LIST_PREVIEW_CALL_TOKEN = "통화";
export const ROOM_LIST_PREVIEW_SYSTEM_TOKEN = "알림";

export function canonicalRoomListPreviewFromMessageFields(input: {
  messageType: string | null | undefined;
  content?: string | null;
  metadata?: unknown;
}): { lastMessage: string; lastMessageType: CommunityMessengerMessageType } {
  const messageType = normalizeMessageType(trimText(input.messageType) || "text");
  const content = trimText(input.content);
  const meta = input.metadata;

  if (messageType === "image") {
    return { lastMessage: ROOM_LIST_PREVIEW_IMAGE_TOKEN, lastMessageType: "image" };
  }
  if (messageType === "file") {
    const name =
      typeof meta === "object" && meta !== null && typeof (meta as { fileName?: unknown }).fileName === "string"
        ? String((meta as { fileName: string }).fileName).trim()
        : "";
    return {
      lastMessage: name || ROOM_LIST_PREVIEW_FILE_TOKEN,
      lastMessageType: "file",
    };
  }
  if (messageType === "voice") {
    return { lastMessage: content || ROOM_LIST_PREVIEW_VOICE_TOKEN, lastMessageType: "voice" };
  }
  if (messageType === "sticker") {
    return { lastMessage: content || ROOM_LIST_PREVIEW_STICKER_TOKEN, lastMessageType: "sticker" };
  }
  if (messageType === "call_stub") {
    return { lastMessage: content || ROOM_LIST_PREVIEW_CALL_TOKEN, lastMessageType: "call_stub" };
  }
  if (messageType === "system") {
    return { lastMessage: content || ROOM_LIST_PREVIEW_SYSTEM_TOKEN, lastMessageType: "system" };
  }
  if (messageType === "gift_certificate") {
    return { lastMessage: content || "상품권", lastMessageType: "gift_certificate" };
  }
  if (messageType === "community_post_share") {
    return { lastMessage: content || "알림", lastMessageType: "community_post_share" };
  }
  /** TEXT (and unknown): keep raw content — including https://…jpg URLs. */
  return { lastMessage: content || "새 메시지", lastMessageType: messageType };
}
