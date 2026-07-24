import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type GroupMessageRoomKind = "direct" | "group" | "trade" | "store_order";

/** FCM data.kind for CM group message push (P0 contract token). */
export const GROUP_MESSAGE_FCM_PUSH_KIND = "group_message" as const;

export function isTradeMessengerDirectKey(directKey: string | null | undefined): boolean {
  const t = (directKey ?? "").trim();
  return t.startsWith("trade_pc:") || t.startsWith("trade_item:");
}

export function isStoreOrderMessengerDirectKey(directKey: string | null | undefined): boolean {
  const t = (directKey ?? "").trim();
  return t.startsWith("store_order:") || t.startsWith("trade_order:");
}

/**
 * Notification / push routing kind — `roomType` + ledger `direct_key`.
 * private_group · open_group → group; trade ledger keys → trade; else direct.
 */
export function resolveGroupMessageRoomKind(
  roomType: CommunityMessengerRoomSummary["roomType"] | string,
  directKey: string | null | undefined
): GroupMessageRoomKind {
  if (roomType === "private_group" || roomType === "open_group") return "group";
  if (isTradeMessengerDirectKey(directKey)) return "trade";
  if (isStoreOrderMessengerDirectKey(directKey)) return "store_order";
  return "direct";
}

export type GroupChatListKindFilter = "all" | "direct" | "private_group" | "trade" | "delivery";

type ChatListFilterRoom = Pick<
  CommunityMessengerRoomSummary,
  "roomType" | "contextMeta" | "messengerDirectKey" | "chatDomain"
>;

function roomIsConfirmedTrade(room: ChatListFilterRoom): boolean {
  if (room.chatDomain === "trade") return true;
  if (
    room.chatDomain === "general_direct" ||
    room.chatDomain === "group" ||
    room.chatDomain === "store_order"
  ) {
    return false;
  }
  if (room.contextMeta?.kind === "trade") return true;
  const dk = (room.messengerDirectKey ?? "").trim();
  return dk.startsWith("trade_pc:") || dk.startsWith("trade_item:");
}

function roomIsConfirmedDelivery(room: ChatListFilterRoom): boolean {
  if (room.chatDomain === "store_order") return true;
  if (
    room.chatDomain === "general_direct" ||
    room.chatDomain === "group" ||
    room.chatDomain === "trade"
  ) {
    return false;
  }
  if (room.contextMeta?.kind === "delivery") return true;
  const dk = (room.messengerDirectKey ?? "").trim();
  if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return false;
  return dk.startsWith("store_order:") || dk.startsWith("trade_order:");
}

/** Mirrors `use-community-messenger-home-state` visible chat list kind chips. */
export function matchesGroupChatListKindFilter(
  room: ChatListFilterRoom,
  chatKindFilter: GroupChatListKindFilter
): boolean {
  if (chatKindFilter === "all") {
    if (room.chatDomain === "trade" || room.chatDomain === "store_order") return false;
    if (room.roomType === "private_group" || room.chatDomain === "group") return true;
    if (room.roomType !== "direct") return false;
    if (roomIsConfirmedTrade(room) || roomIsConfirmedDelivery(room)) return false;
    return true;
  }
  if (chatKindFilter === "direct") {
    if (room.chatDomain === "trade" || room.chatDomain === "store_order" || room.chatDomain === "group") {
      return false;
    }
    if (room.roomType !== "direct") return false;
    if (roomIsConfirmedTrade(room) || roomIsConfirmedDelivery(room)) return false;
    return true;
  }
  if (chatKindFilter === "private_group") {
    return room.roomType === "private_group" || room.chatDomain === "group";
  }
  if (chatKindFilter === "trade") return roomIsConfirmedTrade(room);
  if (chatKindFilter === "delivery") return roomIsConfirmedDelivery(room);
  return true;
}

/** Open-chat tab — joined open groups only (experimental). private_group uses group chip. */
export function groupRoomAppearsInOpenChatJoinedList(room: Pick<CommunityMessengerRoomSummary, "roomType">): boolean {
  return room.roomType === "open_group";
}

export function groupMessageFcmPayloadKindForRoom(
  roomType: CommunityMessengerRoomSummary["roomType"] | string,
  directKey: string | null | undefined
): typeof GROUP_MESSAGE_FCM_PUSH_KIND | null {
  return resolveGroupMessageRoomKind(roomType, directKey) === "group" ? GROUP_MESSAGE_FCM_PUSH_KIND : null;
}
