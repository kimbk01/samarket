import { messageTypeFromPreviewKind } from "@/lib/community-messenger/conversation-engine/mapper-from-room-summary";
import type { ConversationSummary } from "@/lib/community-messenger/conversation-engine/types";
import type { CommunityMessengerMessageType, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/**
 * Map engine summary → room summary fields needed by existing list UI.
 * Preserves reference fields from `base` when provided (contextMeta, memberCount, …).
 */
export function mapConversationToRoomSummary(
  conv: ConversationSummary,
  base?: CommunityMessengerRoomSummary | null
): CommunityMessengerRoomSummary {
  const lastMessageType = messageTypeFromPreviewKind(conv.preview.kind) as CommunityMessengerMessageType;
  if (base) {
    return {
      ...base,
      id: conv.roomId || base.id,
      title: conv.title || base.title,
      subtitle: conv.subtitle || base.subtitle,
      avatarUrl: conv.avatarUrl ?? base.avatarUrl,
      unreadCount: conv.unreadCount,
      isMuted: conv.isMuted,
      isPinned: conv.isPinned,
      isArchivedByViewer: conv.isArchivedByViewer,
      isBlockedHiddenByViewer: conv.isBlockedHiddenByViewer,
      lastMessage: conv.preview.text,
      lastMessageType,
      lastMessageAt: conv.lastActivityAt,
      chatDomain: conv.domain,
      domainIdentityKey: conv.domainIdentityKey,
      domainIdentity: conv.domainIdentityKey,
      peerUserId: conv.peerUserId ?? base.peerUserId,
      messengerDirectKey: conv.messengerDirectKey ?? base.messengerDirectKey,
      roomStatus: (conv.roomStatus as CommunityMessengerRoomSummary["roomStatus"]) || base.roomStatus,
    };
  }
  return {
    id: conv.roomId,
    roomType: (conv.roomType as CommunityMessengerRoomSummary["roomType"]) || "direct",
    roomStatus: (conv.roomStatus as CommunityMessengerRoomSummary["roomStatus"]) || "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: conv.title,
    subtitle: conv.subtitle,
    summary: "",
    avatarUrl: conv.avatarUrl,
    unreadCount: conv.unreadCount,
    isMuted: conv.isMuted,
    isPinned: conv.isPinned,
    lastMessage: conv.preview.text,
    lastMessageType,
    lastMessageAt: conv.lastActivityAt,
    memberCount: 0,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    isArchivedByViewer: conv.isArchivedByViewer,
    isBlockedHiddenByViewer: conv.isBlockedHiddenByViewer,
    chatDomain: conv.domain,
    domainIdentityKey: conv.domainIdentityKey,
    domainIdentity: conv.domainIdentityKey,
    peerUserId: conv.peerUserId,
    messengerDirectKey: conv.messengerDirectKey,
  };
}

/** Split store rows into hub chats (non-group) + groups for bootstrap-shaped paint. */
export function partitionConversationsToHubLists(
  conversations: readonly ConversationSummary[],
  legacyChats: readonly CommunityMessengerRoomSummary[],
  legacyGroups: readonly CommunityMessengerRoomSummary[]
): { chats: CommunityMessengerRoomSummary[]; groups: CommunityMessengerRoomSummary[] } {
  const chatById = new Map(legacyChats.map((r) => [String(r.id).toLowerCase(), r]));
  const groupById = new Map(legacyGroups.map((r) => [String(r.id).toLowerCase(), r]));
  const chats: CommunityMessengerRoomSummary[] = [];
  const groups: CommunityMessengerRoomSummary[] = [];
  for (const conv of conversations) {
    if (conv.domain === "trade" || conv.domain === "store_order") continue;
    const key = conv.roomId.toLowerCase();
    const isGroup =
      conv.domain === "group" ||
      conv.roomType === "private_group" ||
      conv.roomType === "open_group" ||
      groupById.has(key);
    const mapped = mapConversationToRoomSummary(conv, isGroup ? groupById.get(key) : chatById.get(key));
    if (isGroup) groups.push(mapped);
    else chats.push(mapped);
  }
  return { chats, groups };
}
