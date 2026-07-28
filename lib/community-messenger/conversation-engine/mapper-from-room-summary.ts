import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { conversationIdForRoom, resolveConversationDomain } from "@/lib/community-messenger/conversation-engine/identity";
import type {
  ConversationPreview,
  ConversationPreviewKind,
  ConversationSummary,
} from "@/lib/community-messenger/conversation-engine/types";

function revisionFromIso(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function previewKindFromMessageType(mt: string | undefined | null): ConversationPreviewKind {
  const t = String(mt ?? "text").trim();
  if (t === "call_stub") return "call";
  if (
    t === "image" ||
    t === "file" ||
    t === "system" ||
    t === "voice" ||
    t === "sticker" ||
    t === "community_post_share"
  ) {
    return t;
  }
  return "text";
}

export function mapRoomSummaryToConversation(room: CommunityMessengerRoomSummary): ConversationSummary {
  const roomId = String(room.id ?? "").trim();
  const lastActivityAt = String(room.lastMessageAt ?? "") || new Date(0).toISOString();
  const domain = resolveConversationDomain(
    room.chatDomain,
    room.roomType === "private_group" || room.roomType === "open_group" ? "group" : "general_direct"
  );
  const preview: ConversationPreview = {
    kind: previewKindFromMessageType(room.lastMessageType),
    text: String(room.lastMessage ?? ""),
    messageId: null,
  };
  return {
    conversationId: conversationIdForRoom(roomId),
    roomId,
    domain,
    domainIdentityKey: room.domainIdentityKey ?? room.domainIdentity ?? null,
    title: String(room.title ?? ""),
    subtitle: String(room.subtitle ?? ""),
    avatarUrl: room.avatarUrl ?? null,
    unreadCount: Number(room.unreadCount ?? 0) || 0,
    isMuted: Boolean(room.isMuted),
    isPinned: Boolean(room.isPinned),
    isArchivedByViewer: Boolean(room.isArchivedByViewer),
    isBlockedHiddenByViewer: Boolean(room.isBlockedHiddenByViewer),
    lastActivityAt,
    preview,
    revision: revisionFromIso(lastActivityAt),
    roomType: String(room.roomType ?? "direct"),
    roomStatus: String(room.roomStatus ?? "active"),
    peerUserId: room.peerUserId ?? null,
    messengerDirectKey: room.messengerDirectKey ?? null,
  };
}

export function mapRoomSummariesToConversations(
  rooms: readonly CommunityMessengerRoomSummary[]
): ConversationSummary[] {
  return rooms.map(mapRoomSummaryToConversation);
}

export function messageTypeFromPreviewKind(kind: ConversationPreviewKind): string {
  return kind === "call" ? "call_stub" : kind;
}
