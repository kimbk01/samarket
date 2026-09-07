export function buildChatRoomDeepLink(roomId: string): string {
  return `dibay://chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildChatRoomWebPath(roomId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
}

export function buildMissedCallWebPath(roomId: string, callSessionId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}?focus=call-history&callId=${encodeURIComponent(callSessionId.trim())}`;
}

/** @deprecated Legacy experimental `group_rooms` surface. Product GROUP notifications MUST use CM room path (`buildCanonicalNotificationRoomHref` / `buildDomainRoomRoute`). */
export function buildGroupChatWebPath(roomId: string): string {
  return `/group-chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildTradeLegacyChatWebPath(roomId: string): string {
  /** Legacy alias `/chats/:id` — Bell/FCM trade SSOT is `buildChatRoomWebPath` (CM). Keep for entry-intent compatibility only. */
  return `/chats/${encodeURIComponent(roomId.trim())}`;
}
