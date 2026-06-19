import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  buildReplyPreviewSnapshot,
  canReplyToMessage,
} from "@/lib/community-messenger/message-actions/message-reply-policy";
import type { MessageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";

export function canReplyInGroupRoom(
  message: Pick<CommunityMessengerMessage, "messageType" | "pending" | "deletedForEveryoneAt">
): boolean {
  return canReplyToMessage(message, "group" as MessageRoomKindForActions);
}

export function buildGroupReplySnapshot(message: CommunityMessengerMessage) {
  return buildReplyPreviewSnapshot(message);
}

export function normalizeGroupReplyToMessageId(value: unknown): string | null {
  const id = typeof value === "string" ? value.trim() : "";
  return id || null;
}
