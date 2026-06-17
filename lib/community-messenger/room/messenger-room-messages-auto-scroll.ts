/** prepend(과거) vs append(신규 tail) — tail id 불변 시 auto-scroll 금지 */
export type MessengerRoomMessagesAutoScrollDecision =
  | { scroll: true; reason: "own_message_append" | "messages_changed_auto" }
  | { scroll: false; reason: "skip_tail_unchanged" | "empty_timeline" };

export function resolveMessengerRoomMessagesAutoScroll(input: {
  previousTailMessageId: string | null;
  currentTailMessageId: string | null;
  currentTailIsMine: boolean;
}): MessengerRoomMessagesAutoScrollDecision {
  if (!input.currentTailMessageId) {
    return { scroll: false, reason: "empty_timeline" };
  }
  if (input.currentTailIsMine) {
    return { scroll: true, reason: "own_message_append" };
  }
  if (input.currentTailMessageId !== input.previousTailMessageId) {
    return { scroll: true, reason: "messages_changed_auto" };
  }
  return { scroll: false, reason: "skip_tail_unchanged" };
}
