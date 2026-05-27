/** 하단 탭·FAB 스크롤 크롬 — 공통 임계값 */
export const FAB_SCROLL_MOVE_THRESHOLD_PX = 3;
export const FAB_SCROLL_TOP_REVEAL_Y_PX = 8;

export type ScrollChromeAction = "reveal" | "hide" | "hold";

/**
 * 하단 탭 — 아래로 스크롤 시 숨김, 위로·맨 위에서 즉시 표시.
 */
export function resolveBottomNavScrollChromeAction(
  lastY: number,
  y: number
): ScrollChromeAction {
  if (y < FAB_SCROLL_TOP_REVEAL_Y_PX) return "reveal";
  if (y > lastY + FAB_SCROLL_MOVE_THRESHOLD_PX) return "hide";
  if (y < lastY) return "reveal";
  return "hold";
}

/**
 * FAB — 아래·위 스크롤 모두 접힘, 맨 위에서만 즉시 펼침 (idle 1.8s는 훅).
 */
export function resolveFabScrollChromeAction(lastY: number, y: number): ScrollChromeAction {
  if (y < FAB_SCROLL_TOP_REVEAL_Y_PX) return "reveal";
  if (y > lastY + FAB_SCROLL_MOVE_THRESHOLD_PX) return "hide";
  if (y < lastY - FAB_SCROLL_MOVE_THRESHOLD_PX) return "hide";
  return "hold";
}

export function fabScrollShouldRevealAtTop(y: number): boolean {
  return y < FAB_SCROLL_TOP_REVEAL_Y_PX;
}

/** 스크롤 이벤트 시점 Y 와 idle 직후 Y 가 같으면 멈춤으로 간주 */
export function fabScrollHasSettled(snapshotY: number, settledY: number): boolean {
  return Math.abs(settledY - snapshotY) <= FAB_SCROLL_MOVE_THRESHOLD_PX;
}
