"use client";

import { fetchChatRoomDetailApi } from "@/lib/chats/fetch-chat-room-detail-api";
import {
  fetchIntegratedChatRoomMessages,
  fetchLegacyChatRoomMessages,
} from "@/lib/chats/fetch-chat-room-messages-api";

const WARM_TTL_MS = 45_000;
const warmedAtByHref = new Map<string, number>();

function normalizeHrefPath(hrefRaw: string): string {
  const href = hrefRaw.trim();
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return new URL(href).pathname;
    } catch {
      return href;
    }
  }
  return href;
}

function extractChatRoomIdFromHrefPath(pathname: string): string | null {
  const m = /^\/(?:chats|mypage\/trade\/chat)\/([^/?#]+)/.exec(pathname);
  const roomId = m?.[1]?.trim();
  return roomId || null;
}

export function shouldWarmChatRoute(hrefRaw: string): boolean {
  const href = hrefRaw.trim();
  if (!href) return false;
  const now = Date.now();
  const prev = warmedAtByHref.get(href) ?? 0;
  if (now - prev < WARM_TTL_MS) return false;
  warmedAtByHref.set(href, now);
  return true;
}

export function prewarmChatRouteData(hrefRaw: string): void {
  const pathname = normalizeHrefPath(hrefRaw);
  const roomId = extractChatRoomIdFromHrefPath(pathname);
  if (!roomId) return;
  void (async () => {
    const detail = await fetchChatRoomDetailApi(roomId);
    if (detail.ok && detail.room.source === "chat_room") {
      await fetchIntegratedChatRoomMessages(detail.room.id);
      return;
    }
    await fetchLegacyChatRoomMessages(roomId);
  })();
}
