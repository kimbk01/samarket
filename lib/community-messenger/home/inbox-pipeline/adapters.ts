import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type {
  CommunityMessengerCriticalRoomRow,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type {
  CanonicalMessengerHomeRoomPatch,
  MessengerHomeRoomEvent,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeContextMeta(raw: unknown): CommunityMessengerRoomContextMetaV1 | null {
  if (raw == null) return null;
  if (typeof raw === "string") return parseCommunityMessengerRoomContextMeta(raw);
  if (typeof raw === "object") return parseCommunityMessengerRoomContextMeta(JSON.stringify(raw));
  return null;
}

export function adaptCriticalRoomToCanonicalPatch(
  row: CommunityMessengerCriticalRoomRow
): CanonicalMessengerHomeRoomPatch {
  const gm = row.group_meta;
  const patch: CanonicalMessengerHomeRoomPatch = {
    roomId: row.room_id,
    roomType: row.room_type,
    directKey: row.direct_key,
    title: row.title,
    avatarUrl: row.avatar_url,
    latestMessage: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: gm?.member_count ?? (row.room_type === "direct" ? 2 : 0),
  };
  if (hasOwn(row, "context_meta")) {
    patch.contextMeta = normalizeContextMeta(row.context_meta);
  }
  return patch;
}

export function adaptRoomSummaryToCanonicalPatch(
  summary: CommunityMessengerRoomSummary
): CanonicalMessengerHomeRoomPatch {
  const patch: CanonicalMessengerHomeRoomPatch = {
    roomId: summary.id,
    roomType: summary.roomType,
    directKey: summary.messengerDirectKey ?? null,
    title: summary.title,
    avatarUrl: summary.avatarUrl,
    latestMessage: summary.lastMessage,
    latestMessageType: summary.lastMessageType,
    lastMessageAt: summary.lastMessageAt,
    unreadCount: summary.unreadCount,
    isArchived: Boolean(summary.isArchivedByViewer),
    isBlockedHidden: Boolean(summary.isBlockedHiddenByViewer),
    roomStatus: summary.roomStatus,
    deletedAt: summary.deletedAt ?? null,
    memberCount: summary.memberCount,
  };
  if (hasOwn(summary, "contextMeta")) {
    patch.contextMeta = summary.contextMeta ?? null;
  }
  if (hasOwn(summary, "chatDomain")) {
    patch.chatDomain = summary.chatDomain ?? null;
  }
  if (hasOwn(summary, "domainIdentity")) {
    const id = summary.domainIdentity;
    patch.domainIdentity = typeof id === "string" ? id : null;
  }
  return patch;
}

export function makeMessengerHomeRoomEvent(
  source: MessengerHomeSource,
  generation: number,
  patch: CanonicalMessengerHomeRoomPatch
): MessengerHomeRoomEvent {
  return {
    kind: "upsert",
    source,
    generation,
    roomId: patch.roomId,
    patch,
  };
}
