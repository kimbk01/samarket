import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { toMessengerPolicyRoomType } from "@/lib/messenger-policy/messenger-policy-room-type";

export type MessageRoomKindForActions = "direct" | "group" | "trade";

export function messageRoomKindForActions(room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta">): MessageRoomKindForActions {
  return toMessengerPolicyRoomType({
    roomType: room.roomType,
    contextMeta: room.contextMeta ?? null,
  });
}
