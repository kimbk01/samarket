import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { messageRoomKindForActions, type MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import { canDeleteMessageForEveryone, canDeleteMessageForMe } from "@/lib/community-messenger/message-actions/message-delete-policy";
import { canReplyToMessage } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { canShareMessage } from "@/lib/community-messenger/message-actions/message-share-policy";
import { canReactToMessage, MESSENGER_QUICK_REACTION_KEYS } from "@/lib/community-messenger/message-actions/message-reaction-policy";

export type MessageLongPressMenuAction = "copy" | "reply" | "share" | "delete" | "react";

export type MessageLongPressActionDef = {
  action: MessageLongPressMenuAction;
  enabled: boolean;
  reason?: string;
};

export function getMessageLongPressActions(input: {
  message: CommunityMessengerMessage;
  room: Pick<CommunityMessengerRoomSummary, "roomType" | "contextMeta" | "isReadonly" | "roomStatus">;
  viewerUserId: string;
  roomUnavailable: boolean;
}): MessageLongPressActionDef[] {
  const { message, room, roomUnavailable } = input;
  const rk: MessageRoomKindForActions = messageRoomKindForActions(room);
  const blocked = roomUnavailable || room.isReadonly || room.roomStatus === "blocked";

  const copyEnabled =
    !blocked &&
    message.messageType === "text" &&
    !message.pending &&
    Boolean(message.content?.trim());

  return [
    { action: "react", enabled: !blocked && canReactToMessage(message, rk) },
    {
      action: "copy",
      enabled: copyEnabled,
      reason: copyEnabled ? undefined : "복사할 수 없는 메시지입니다",
    },
    {
      action: "reply",
      enabled: !blocked && canReplyToMessage(message, rk),
    },
    {
      action: "share",
      enabled: !blocked && canShareMessage(message, rk),
    },
    {
      action: "delete",
      enabled: !blocked && (canDeleteMessageForMe(message, rk) || canDeleteMessageForEveryone(message, rk)),
    },
  ];
}

export { MESSENGER_QUICK_REACTION_KEYS };
