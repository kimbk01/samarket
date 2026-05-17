"use client";

export type MessengerChatListUnreadTier = "bootstrap-room";

export type MessengerChatListUnreadResolution = {
  count: number;
  tier: MessengerChatListUnreadTier;
};

/**
 * 메신저·거래 CM 연동 목록 행의 표시용 미읽음 수.
 * R2-M2 — React bootstrap 행만 사용 (Zustand hub list 금지).
 */
export function resolveMessengerChatListUnread(
  _state: unknown,
  _roomId: string | null | undefined,
  bootstrapUnread: number
): MessengerChatListUnreadResolution {
  const count = Math.max(0, Math.floor(Number(bootstrapUnread) || 0));
  return { count, tier: "bootstrap-room" };
}

/** 목록 행: 부트스트랩 행 unread 만 표시 */
export function useMessengerChatListUnread(
  _storeLookupRoomId: string | null | undefined,
  bootstrapUnread: number
): MessengerChatListUnreadResolution {
  const count = Math.max(0, Math.floor(Number(bootstrapUnread) || 0));
  return { count, tier: "bootstrap-room" };
}
