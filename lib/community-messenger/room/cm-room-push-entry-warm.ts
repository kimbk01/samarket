"use client";

import {
  appendMessengerPushEntryQuery,
  markMessengerPushEntryIntent,
  parseMessengerRoomIdFromAppPath,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";
import { prefetchCommunityMessengerRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";

/**
 * Push / deeplink → CM·trade room 진입 warm-up (mark intent + snapshot prefetch).
 * 목록 탭 forward-navigation 과 분리 — API·notification dispatch 미변경.
 */
export function prepareMessengerPushRoomEntry(path: string): string {
  const trimmed = path.trim();
  const roomId = parseMessengerRoomIdFromAppPath(trimmed);
  if (!roomId) return trimmed;

  markMessengerPushEntryIntent(roomId);

  const pathname = trimmed.split("?")[0]?.split("#")[0]?.trim() ?? "";
  if (pathname.startsWith("/community-messenger/rooms/")) {
    void prefetchCommunityMessengerRoomSnapshot(roomId).catch(() => false);
  }

  return appendMessengerPushEntryQuery(trimmed);
}
