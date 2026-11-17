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

/**
 * F2-③ 끝 메시지 병합 뒤 읽기 상태 동기화(S3)를 예약할지 (설계 2026-11-18 PR-1 · 검토 #7·재검토).
 * - 끝 id 가 안 바뀌면 안 함
 * - 내 글 전송(force 따라가기): 그 경로가 맨 아래·끝 id 를 바로 쓰고, 높이 정착 뒤 ResizeObserver →
 *   applyLayoutPreserve → S2 가 맞춘다 — 여기서 rAF 로 읽으면 사진처럼 높이가 정해지기 전이라 「↓」가 깜빡일 수 있다
 * - 내 글 ack 로 id 만 바뀜(`skip_ack_id_replace`) + 엔진이 맨 아래 고정: 같은 이유로 건너뜀
 * - 그 밖(상대 글 수신·위쪽을 읽는 중 수신): 예약
 */
export function shouldScheduleTailReaderStateSync(input: {
  tailChanged: boolean;
  decision: MessengerRoomMessagesAutoScrollDecision;
  engineStickToBottom: boolean;
}): boolean {
  if (!input.tailChanged) return false;
  if (input.decision.scroll && input.decision.reason === "own_message_append") return false;
  if (!input.decision.scroll && input.decision.reason === "skip_ack_id_replace" && input.engineStickToBottom) {
    return false;
  }
  return true;
}
