/**
 * U-G (재감사 2026-10-28): 알림센터 → 알림 목적지 → 뒤로 돌아왔을 때 스크롤 위치 유지.
 * 행을 눌러 떠날 때만 복원 표시를 남기고, 다른 경로로 들어오면 기존처럼 맨 위에서 시작한다.
 * sessionStorage 를 못 쓰는 환경에서는 조용히 맨 위로.
 */
const RESTORE_FLAG_KEY = "dibay:notif-center:restore";
const SCROLL_Y_KEY = "dibay:notif-center:scroll-y";

export function markNotificationCenterScrollRestore(): void {
  try {
    sessionStorage.setItem(RESTORE_FLAG_KEY, "1");
    sessionStorage.setItem(SCROLL_Y_KEY, String(Math.max(0, Math.round(window.scrollY))));
  } catch {
    /* storage 불가 — 복원 생략 */
  }
}

/** 복원할 위치(px). 표시가 없으면 null — 호출 후 표시는 지운다. */
export function consumeNotificationCenterScrollRestore(): number | null {
  try {
    if (sessionStorage.getItem(RESTORE_FLAG_KEY) !== "1") return null;
    sessionStorage.removeItem(RESTORE_FLAG_KEY);
    const y = Number(sessionStorage.getItem(SCROLL_Y_KEY));
    return Number.isFinite(y) && y > 0 ? y : null;
  } catch {
    return null;
  }
}
