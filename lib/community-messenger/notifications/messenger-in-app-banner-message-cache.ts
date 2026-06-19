"use client";

import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";

const messageRowByRoomNorm = new Map<string, Record<string, unknown>>();

/** Realtime INSERT 직후 in-app banner 가 participant unread 보다 먼저 프리뷰를 쓸 수 있게 캐시 */
export function recordMessengerInAppBannerMessageHint(
  roomId: string,
  messageRow: Record<string, unknown>
): void {
  const norm = normalizeMessengerRealtimeRoomId(roomId);
  if (!norm) return;
  messageRowByRoomNorm.set(norm, messageRow);
}

export function peekMessengerInAppBannerMessageRow(roomId: string): Record<string, unknown> | null {
  const norm = normalizeMessengerRealtimeRoomId(roomId);
  if (!norm) return null;
  return messageRowByRoomNorm.get(norm) ?? null;
}

export function clearMessengerInAppBannerMessageCacheForTests(): void {
  messageRowByRoomNorm.clear();
}
