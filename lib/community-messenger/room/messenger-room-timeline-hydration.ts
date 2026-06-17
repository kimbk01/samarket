/** 타임라인에 메시지·lastMessage 힌트가 있는지 — 일반·거래·배달 공통 */
export function hasMessengerRoomTimelineLoadHint(input: {
  roomMessagesLength: number;
  snapshotMessagesLength: number;
  lastMessage?: string | null;
}): boolean {
  return (
    input.roomMessagesLength > 0 ||
    input.snapshotMessagesLength > 0 ||
    Boolean(input.lastMessage?.trim())
  );
}

/**
 * 메신저 방 타임라인 중앙 버퍼링 스피너 표시 여부.
 * 신규·빈 방(`clientShellPlaceholder`, 힌트 없음)은 스피너 없이 빈 타임라인을 먼저 보여준다.
 */
export function shouldShowMessengerRoomTimelineHydrationSkeleton(input: {
  displayRoomMessagesLength: number;
  roomMessagesLength: number;
  hydrationPass: number;
  clientShellPlaceholder: boolean;
  loading: boolean;
  shouldRecoverEmptyTimeline: boolean;
  snapshotMessagesLength: number;
  lastMessage?: string | null;
}): boolean {
  if (input.displayRoomMessagesLength > 0) return false;
  if (input.roomMessagesLength > 0 && input.hydrationPass >= 2) return false;

  const hasTimelineLoadHint = hasMessengerRoomTimelineLoadHint({
    roomMessagesLength: input.roomMessagesLength,
    snapshotMessagesLength: input.snapshotMessagesLength,
    lastMessage: input.lastMessage,
  });

  if (input.clientShellPlaceholder) {
    return hasTimelineLoadHint;
  }

  return (
    hasTimelineLoadHint &&
    (input.loading || input.hydrationPass < 2 || input.shouldRecoverEmptyTimeline)
  );
}
