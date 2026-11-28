/**
 * 화면 고정 하단 바(글 상세 댓글 입력줄 등) 높이 공용 계약 — 토스트가 바를 덮지 않게 바 위로 올린다
 * (관심이웃 최종 감사 D8 · 전체 수정 설계 v2 §5-4). `.dibay-toast-stack` 이 `--dibay-fixed-bottom-bar` 를 더한다.
 * 바가 둘 이상 겹쳐 붙었다 떨어질 때 새 바의 값을 지우지 않도록, **자기가 쓴 값일 때만** 지운다.
 */
export const FIXED_BOTTOM_BAR_CSS_VAR = "--dibay-fixed-bottom-bar";

let currentOwner: symbol | null = null;

export function setFixedBottomBarOffset(owner: symbol, heightPx: number): void {
  if (typeof document === "undefined") return;
  currentOwner = owner;
  document.documentElement.style.setProperty(FIXED_BOTTOM_BAR_CSS_VAR, `${Math.max(0, Math.round(heightPx))}px`);
}

export function clearFixedBottomBarOffset(owner: symbol): void {
  if (typeof document === "undefined") return;
  if (currentOwner !== owner) return;
  currentOwner = null;
  document.documentElement.style.removeProperty(FIXED_BOTTOM_BAR_CSS_VAR);
}
