/**
 * U-G (재감사 2026-10-28): 알림센터 → 알림 목적지 → 뒤로 돌아왔을 때 스크롤 위치 유지.
 * 행을 눌러 떠날 때만 복원 표시를 남기고, 다른 경로로 들어오면 기존처럼 맨 위에서 시작한다.
 * sessionStorage 를 못 쓰는 환경에서는 조용히 맨 위로.
 *
 * U6 (2026-10-29): 앱 셸에서는 창이 아니라 `[data-main-hub-scroll-body]` 가 스크롤된다 —
 * 저장·복원 모두 앱 본문 스크롤 루트 기준 (`store-detail-scroll-root`).
 */
import {
  getStoreDetailAppScrollRoot,
  getStoreDetailScrollTop,
  isDocumentScrollRoot,
  setStoreDetailScrollTop,
} from "@/lib/ui/store-detail-scroll-root";

const RESTORE_FLAG_KEY = "dibay:notif-center:restore";
const SCROLL_Y_KEY = "dibay:notif-center:scroll-y";
/** 목록 높이가 목표 위치에 닿을 때까지 기다리는 최대 시간 */
const RESTORE_MAX_WAIT_MS = 1000;

export function markNotificationCenterScrollRestore(): void {
  try {
    sessionStorage.setItem(RESTORE_FLAG_KEY, "1");
    sessionStorage.setItem(SCROLL_Y_KEY, String(Math.max(0, Math.round(getStoreDetailScrollTop()))));
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

export function resetNotificationCenterScroll(): void {
  setStoreDetailScrollTop(0);
}

/**
 * 목록 행이 그려진 뒤 호출 — 스크롤 높이가 목표에 닿을 때까지 프레임마다 맞추고(최대 1초),
 * 사용자가 직접 스크롤을 시작하면 멈춘다. 반환값은 정리 함수.
 */
export function applyNotificationCenterScrollRestore(targetY: number): () => void {
  const root = getStoreDetailAppScrollRoot();
  const target: Window | HTMLElement = isDocumentScrollRoot(root) ? window : root;
  const startedAt = performance.now();
  let raf = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    window.cancelAnimationFrame(raf);
    target.removeEventListener("touchstart", stop);
    target.removeEventListener("wheel", stop);
  };
  target.addEventListener("touchstart", stop, { passive: true });
  target.addEventListener("wheel", stop, { passive: true });
  const step = () => {
    if (stopped) return;
    setStoreDetailScrollTop(targetY, { scrollRoot: root });
    const reachable = root.scrollHeight - root.clientHeight >= targetY - 1;
    if (reachable || performance.now() - startedAt >= RESTORE_MAX_WAIT_MS) {
      stop();
      return;
    }
    raf = window.requestAnimationFrame(step);
  };
  step();
  return stop;
}
