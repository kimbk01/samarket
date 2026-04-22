import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

/** 롱프레스 바에 노출하는 고정 반응 키(저장값과 동일) */
export const MESSENGER_QUICK_REACTION_KEYS = ["😀", "😮", "❤️", "👍", "👏", "😢"] as const;

export type MessengerQuickReactionKey = (typeof MESSENGER_QUICK_REACTION_KEYS)[number];

export function isMessengerQuickReactionKey(key: string): key is MessengerQuickReactionKey {
  return (MESSENGER_QUICK_REACTION_KEYS as readonly string[]).includes(key);
}

export function canReactToMessage(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending" | "deletedForEveryoneAt" | "isMine">,
  roomKind: MessageRoomKindForActions
): boolean {
  if (message.isMine) return false;
  if (message.pending) return false;
  if (message.messageType === "system") return false;
  if (message.deletedForEveryoneAt) return false;
  if (roomKind === "trade" && message.messageType !== "text" && message.messageType !== "image" && message.messageType !== "sticker") {
    return false;
  }
  return true;
}
