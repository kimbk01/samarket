/** 통화 목록 스와이프 행 id — 채팅방 스와이프 id 와 충돌 방지 */
export function communityMessengerCallLogSwipeItemId(callLogId: string): string {
  return `call-log:${callLogId.trim()}`;
}

export const COMMUNITY_MESSENGER_CALL_LOG_SWIPE_ACTION_W_PX = 72;

/** 스와이프 액션(삭제 등) — document outside-tap 예외·navigate guard */
export const CALL_LOG_SWIPE_ACTION_ATTR = "data-call-log-swipe-action";

/** 열린 스와이프 surface — outside-tap 시 닫지 않을 영역 */
export const CALL_LOG_SWIPE_SURFACE_OPEN_SELECTOR = "[data-call-log-swipe-surface='open']";

/** outside tap 으로 스와이프를 닫아도 되는지 — 삭제·액션 버튼은 제외 */
export function shouldCloseCallLogSwipeOnOutsidePointerDown(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(CALL_LOG_SWIPE_SURFACE_OPEN_SELECTOR)) return false;
  if (target.closest(`[${CALL_LOG_SWIPE_ACTION_ATTR}]`)) return false;
  return true;
}
