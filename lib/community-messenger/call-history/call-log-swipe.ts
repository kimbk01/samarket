/** 통화 목록 스와이프 행 id — 채팅방 스와이프 id 와 충돌 방지 */
export function communityMessengerCallLogSwipeItemId(callLogId: string): string {
  return `call-log:${callLogId.trim()}`;
}

export const COMMUNITY_MESSENGER_CALL_LOG_SWIPE_ACTION_W_PX = 72;
