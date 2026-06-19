/**
 * 거래·배달 목록 행 completed 상태 라벨·미리보기 (pure).
 */
import {
  isCommerceChatRoomCompleted,
  isCompletedChatReadonly,
} from "@/lib/community-messenger/chat-room-list-lifecycle-policy";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";

export type CommerceChatListPresentation = {
  readonly isReadonlyCompleted: boolean;
  statusLabelKey: MessageKey | null;
  previewKey: MessageKey | null;
};

export function resolveCommerceChatListPresentation(
  room: CommunityMessengerRoomSummary
): CommerceChatListPresentation {
  const readonlyCompleted = isCompletedChatReadonly(room);
  if (!readonlyCompleted || !isCommerceChatRoomCompleted(room)) {
    return { isReadonlyCompleted: readonlyCompleted, statusLabelKey: null, previewKey: null };
  }
  if (room.contextMeta?.kind === "trade") {
    return {
      isReadonlyCompleted: true,
      statusLabelKey: "chats_trade_list_sold_completed_label",
      previewKey: "chats_trade_list_completed_chat_preview",
    };
  }
  if (room.contextMeta?.kind === "delivery") {
    return {
      isReadonlyCompleted: true,
      statusLabelKey: "chats_delivery_list_completed_label",
      previewKey: "chats_delivery_list_completed_chat_preview",
    };
  }
  return { isReadonlyCompleted: readonlyCompleted, statusLabelKey: null, previewKey: null };
}
