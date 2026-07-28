/** prepend(과거) vs append(신규 tail) — tail id 불변 시 auto-scroll 금지 */
export type ChatThreadMessagesAutoScrollDecision =
  | { scroll: true; reason: "own_message_append" | "peer_message_append" }
  | { scroll: false; reason: "skip_tail_unchanged" | "empty_timeline" | "skip_ack_id_replace" };

export function resolveChatThreadMessagesAutoScroll(input: {
  previousTailMessageId: string | null;
  currentTailMessageId: string | null;
  currentTailIsMine: boolean;
  previousTailClientMessageId?: string | null;
  currentTailClientMessageId?: string | null;
}): ChatThreadMessagesAutoScrollDecision {
  if (!input.currentTailMessageId) {
    return { scroll: false, reason: "empty_timeline" };
  }
  const prevCid = input.previousTailClientMessageId?.trim() ?? "";
  const curCid = input.currentTailClientMessageId?.trim() ?? "";
  if (
    input.currentTailIsMine &&
    prevCid &&
    curCid &&
    prevCid === curCid &&
    input.previousTailMessageId &&
    input.previousTailMessageId !== input.currentTailMessageId
  ) {
    return { scroll: false, reason: "skip_ack_id_replace" };
  }
  if (input.currentTailMessageId === input.previousTailMessageId) {
    return { scroll: false, reason: "skip_tail_unchanged" };
  }
  if (input.currentTailIsMine) {
    return { scroll: true, reason: "own_message_append" };
  }
  return { scroll: true, reason: "peer_message_append" };
}

/** @deprecated alias — CM redesign moved SSOT to chat-thread-scroll */
export const resolveMessengerRoomMessagesAutoScroll = resolveChatThreadMessagesAutoScroll;
export type MessengerRoomMessagesAutoScrollDecision = ChatThreadMessagesAutoScrollDecision;
