import { isChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { ConversationDomain } from "@/lib/community-messenger/conversation-engine/types";

export function normalizeConversationRoomId(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

/** Conversation identity is room-scoped; domains never merge. */
export function conversationIdForRoom(roomId: string): string {
  return normalizeConversationRoomId(roomId);
}

export function resolveConversationDomain(
  chatDomain: unknown,
  fallback: ConversationDomain = "general_direct"
): ConversationDomain {
  if (isChatDomain(chatDomain)) return chatDomain;
  return fallback;
}

export function domainsEqual(a: ChatDomain | null | undefined, b: ChatDomain | null | undefined): boolean {
  return String(a ?? "") === String(b ?? "");
}
