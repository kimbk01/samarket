/** prepend(과거) vs append(신규 tail) — tail id 불변 시 auto-scroll 금지 */
export type MessengerRoomMessagesAutoScrollDecision =
  | { scroll: true; reason: "own_message_append" | "peer_message_append" }
  | {
      scroll: false;
      reason: "skip_tail_unchanged" | "empty_timeline" | "skip_ack_id_replace" | "skip_first_observation";
    };

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
  /**
   * D5-R2 (Owner 「D5 구현」 2026-11-09): 방에 들어와(또는 방이 바뀌어) 처음 보는 마지막 메시지는 「새로 추가」가 아니다 —
   * 기록만 하고 스크롤하지 않는다. 진입 위치는 진입 정책(entry anchor) 한 곳이 정한다.
   * 이전: 마지막 메시지가 내 것이면 「방금 보냄」으로 보고 맨 아래로 강제 이동 → 돌아옴·첫 안 읽음 진입 전에 맨 아래가 잠깐 보이고
   * 맨 아래 상태 표시가 켜져 저장 위치가 지워짐(운영 실측 38ms `scrollToBottomExplicit`).
   */
  if (!input.previousTailMessageId) {
    return { scroll: false, reason: "skip_first_observation" };
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
