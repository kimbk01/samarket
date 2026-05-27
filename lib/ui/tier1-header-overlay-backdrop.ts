/**
 * 1단 헤더 돋보기·알림 팝업 — 딤 배경 단일 계약.
 *
 * - 토큰: `--delivery-backdrop` (`app/delivery-tokens.css` → `--dibay-dim`)
 * - CSS: `app/delivery-components.css` `.sam-tier1-header-overlay-backdrop`
 * DO NOT: 검색·알림 각각 bg-black/25·별도 backdrop 클래스 — 여기·CSS 한 곳만 수정.
 */

/** Portal 루트 — 검색·알림 동일 z-index */
export const TIER1_HEADER_OVERLAY_SHELL_CLASS = "fixed inset-0 z-[1260]";

/** 딤 버튼/레이어 — `absolute inset-0` (셸 `fixed` 안) */
export const TIER1_HEADER_OVERLAY_BACKDROP_CLASS = "sam-tier1-header-overlay-backdrop absolute inset-0";

export function tier1HeaderOverlayBackdropStateClass(entered: boolean): string {
  return entered
    ? "sam-tier1-header-overlay-backdrop--open"
    : "sam-tier1-header-overlay-backdrop--closed";
}
