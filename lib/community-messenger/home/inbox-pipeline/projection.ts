import { shouldShowCommerceChatInList } from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import { sortChatListRooms } from "@/lib/community-messenger/chat-list/chat-list-sorter";
import { dedupeDeliveryMessengerRoomSummaries } from "@/lib/community-messenger/dedupe-delivery-messenger-room-summaries";
import { dedupeTradeMessengerRoomSummaries } from "@/lib/community-messenger/trade-list-canonical-key";
import { resolveMessengerHomeBucket } from "@/lib/community-messenger/home/inbox-pipeline/classification";
import type {
  CanonicalMessengerHomeRoom,
  MessengerHomeBucket,
  MessengerHomeProjection,
} from "@/lib/community-messenger/home/inbox-pipeline/types";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function toRoomSummary(room: CanonicalMessengerHomeRoom): CommunityMessengerRoomSummary {
  return {
    id: room.roomId,
    roomType: room.roomType,
    roomStatus: room.roomStatus,
    visibility: room.roomType === "open_group" ? "public" : "private",
    joinPolicy: room.roomType === "open_group" ? "free" : "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: room.title,
    subtitle: "",
    summary: "",
    avatarUrl: room.avatarUrl,
    unreadCount: room.unreadCount,
    lastMessage: room.latestMessage,
    lastMessageType: room.latestMessageType,
    lastMessageAt: room.lastMessageAt,
    memberCount: room.memberCount,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: room.roomType === "open_group",
    requiresPassword: false,
    allowMemberInvite: true,
    messengerDirectKey: room.directKey,
    isArchivedByViewer: room.isArchived,
    isBlockedHiddenByViewer: room.isBlockedHidden,
    contextMeta: room.contextMeta,
    chatDomain: room.chatDomain,
    domainIdentity: room.domainIdentity,
  };
}

function sortedVisibleCommerceIds(
  summaries: CommunityMessengerRoomSummary[],
  dedupe: (rooms: CommunityMessengerRoomSummary[]) => CommunityMessengerRoomSummary[],
  nowMs: number
): string[] {
  return sortChatListRooms(dedupe(summaries).filter((room) => shouldShowCommerceChatInList(room, nowMs))).map(
    (room) => room.id
  );
}

export function buildMessengerHomeProjection(
  rooms: Iterable<CanonicalMessengerHomeRoom>,
  viewerUserId: string,
  options?: { nowMs?: number }
): MessengerHomeProjection {
  const nowMs = options?.nowMs ?? Date.now();
  const bucketByRoomId = new Map<string, MessengerHomeBucket>();
  const unreadByRoomId = new Map<string, number>();
  const tradeRooms: CommunityMessengerRoomSummary[] = [];
  const deliveryRooms: CommunityMessengerRoomSummary[] = [];
  const inboxRooms: CommunityMessengerRoomSummary[] = [];

  for (const room of rooms) {
    const bucket = resolveMessengerHomeBucket(room, viewerUserId);
    bucketByRoomId.set(room.roomId, bucket);
    unreadByRoomId.set(room.roomId, room.unreadCount);
    const summary = toRoomSummary(room);
    if (bucket === "trade") {
      tradeRooms.push(summary);
    } else if (bucket === "delivery") {
      deliveryRooms.push(summary);
    } else if (bucket === "direct" || bucket === "group") {
      inboxRooms.push(summary);
    }
  }

  return {
    tradeRoomIds: sortedVisibleCommerceIds(tradeRooms, dedupeTradeMessengerRoomSummaries, nowMs),
    deliveryRoomIds: sortedVisibleCommerceIds(deliveryRooms, dedupeDeliveryMessengerRoomSummaries, nowMs),
    inboxRoomIds: sortChatListRooms(inboxRooms).map((room) => room.id),
    bucketByRoomId,
    unreadByRoomId,
  };
}
