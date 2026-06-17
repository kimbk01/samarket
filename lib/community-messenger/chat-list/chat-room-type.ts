import {
  communityMessengerRoomInboxGroupKind,
  type CommunityMessengerInboxGroupKind,
} from "@/lib/community-messenger/messenger-room-domain";
import {
  communityMessengerRoomIsInboxHidden,
  type CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";

export type ChatListRoomType =
  | "direct_general"
  | "direct_trade"
  | "direct_delivery"
  | "group_general"
  | "archived";

export type ChatListRoomTypeBadgeToken = {
  roomType: ChatListRoomType;
  labelKey: string;
  color: string;
};

const BADGE_BY_KIND: Record<CommunityMessengerInboxGroupKind, Omit<ChatListRoomTypeBadgeToken, "roomType">> = {
  general: { labelKey: "cm_chat_list_badge_general", color: "#006241" },
  trade: { labelKey: "cm_chat_list_badge_trade", color: "#F59E0B" },
  delivery: { labelKey: "cm_chat_list_badge_delivery", color: "#2563EB" },
};

export function resolveChatListRoomType(room: CommunityMessengerRoomSummary): ChatListRoomType {
  if (communityMessengerRoomIsInboxHidden(room)) return "archived";
  if (room.roomType !== "direct") return "group_general";
  const kind = communityMessengerRoomInboxGroupKind(room);
  if (kind === "trade") return "direct_trade";
  if (kind === "delivery") return "direct_delivery";
  return "direct_general";
}

export function chatListRoomTypeBadge(room: CommunityMessengerRoomSummary): ChatListRoomTypeBadgeToken {
  const roomType = resolveChatListRoomType(room);
  if (roomType === "group_general") {
    return { roomType, labelKey: "cm_chat_list_badge_group", color: "#7C3AED" };
  }
  if (roomType === "archived") {
    return { roomType, labelKey: "cm_chat_list_badge_archive", color: "#6B7280" };
  }
  const kind = roomType === "direct_trade" ? "trade" : roomType === "direct_delivery" ? "delivery" : "general";
  return { roomType, ...BADGE_BY_KIND[kind] };
}
