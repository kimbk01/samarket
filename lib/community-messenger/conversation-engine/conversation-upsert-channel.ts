/** Conversation upsert broadcast — client/server shared (no `use client`). */

export const CM_CONVERSATION_UPSERT_BROADCAST_EVENT = "cm_conversation_upsert";

export function communityMessengerConversationUpsertChannelName(roomId: string): string {
  return `cm-conversation-upsert:${String(roomId ?? "").trim().toLowerCase()}`;
}

export type ConversationUpsertBroadcastPayload = Readonly<{
  v: 1;
  eventId: string;
  roomId: string;
  canonicalRoomId: string;
  domain: string;
  lastActivityAt: string;
  revision: number;
  preview: {
    kind: string;
    text: string;
    messageId?: string | null;
    callStatus?: string | null;
    callId?: string | null;
    sessionId?: string | null;
  };
  unreadCount?: number;
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
}>;
