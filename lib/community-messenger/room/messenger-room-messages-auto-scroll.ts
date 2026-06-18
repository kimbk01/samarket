/** prepend(과거) vs append(신규 tail) — tail id 불변 시 auto-scroll 금지 */
export type MessengerRoomMessagesAutoScrollDecision =
  | { scroll: true; reason: "own_message_append" | "messages_changed_auto" }
  | { scroll: false; reason: "skip_tail_unchanged" | "empty_timeline" | "skip_ack_id_replace" };

export function resolveMessengerRoomMessagesAutoScroll(input: {
  previousTailMessageId: string | null;
  currentTailMessageId: string | null;
  currentTailIsMine: boolean;
  previousTailClientMessageId?: string | null;
  currentTailClientMessageId?: string | null;
}): MessengerRoomMessagesAutoScrollDecision {
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
  if (input.currentTailIsMine) {
    return { scroll: true, reason: "own_message_append" };
  }
  if (input.currentTailMessageId !== input.previousTailMessageId) {
    return { scroll: true, reason: "messages_changed_auto" };
  }
  return { scroll: false, reason: "skip_tail_unchanged" };
}
