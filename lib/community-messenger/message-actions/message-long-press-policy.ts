import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { messageRoomKindForActions, type MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import {
  canDeleteMessageForEveryone,
  canHideMessageForMe,
} from "@/lib/community-messenger/message-actions/message-delete-policy";
import { canEditMessageText } from "@/lib/community-messenger/message-actions/message-edit-policy";
import { canReplyToMessage } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { canShareMessage } from "@/lib/community-messenger/message-actions/message-share-policy";
import { canReactToMessage, MESSENGER_QUICK_REACTION_KEYS } from "@/lib/community-messenger/message-actions/message-reaction-policy";

export type MessageLongPressMenuAction = "copy" | "reply" | "share" | "delete" | "react" | "edit";

export type MessageLongPressActionDef = {
  action: MessageLongPressMenuAction;
  enabled: boolean;
  reason?: string;
  /** 비활성 이유 문구 키 — 화면이 `t()` 로 그린다 */
  reasonKey?: MessageKey;
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
      reasonKey: copyEnabled ? undefined : "cm_ui_cannot_copy_message",
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
      action: "edit",
      enabled: !blocked && canEditMessageText(message, rk),
    },
    {
      action: "delete",
      enabled:
        !blocked &&
        (canHideMessageForMe(message, rk) || canDeleteMessageForEveryone(message, rk)),
    },
  ];
}

export { MESSENGER_QUICK_REACTION_KEYS };
