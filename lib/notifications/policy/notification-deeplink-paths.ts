export function buildChatRoomDeepLink(roomId: string): string {
  return `dibay://chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildChatRoomWebPath(roomId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
}

export function buildMissedCallWebPath(roomId: string, callSessionId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}?focus=call-history&callId=${encodeURIComponent(callSessionId.trim())}`;
}

export function buildGroupChatWebPath(roomId: string): string {
  return `/group-chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildTradeLegacyChatWebPath(roomId: string): string {
  return `/chats/${encodeURIComponent(roomId.trim())}`;
}
