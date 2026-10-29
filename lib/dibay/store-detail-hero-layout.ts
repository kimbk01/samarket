/**
 * 매장 상세 히어로 — QuickShell·PASS1 seed·summary API 동일 박스( CLS 방지 ).
 * 목록 카드(5:3)와 다르게 상세 전용 와이드 히어로 규격.
 */

export const STORE_DETAIL_HERO_CLAMP_MIN = "13rem";
export const STORE_DETAIL_HERO_CLAMP_VH = "44vh";
export const STORE_DETAIL_HERO_CLAMP_MAX = "18rem";
export const STORE_DETAIL_HERO_MIN_HEIGHT_PX = 208;

/**
 * WP6 (2026-10-29) — 매장 화면 히어로 = 콘텐츠 폭 × 0.75 (4:3).
 * QuickShell shimmer·placeholder 도 같은 비율 (CLS 방지).
 */
export const STORE_DETAIL_HERO_ASPECT_RATIO = "4 / 3";

/** Tailwind — QuickShell shimmer·placeholder (StoreOrderHeroSummary 4:3 박스와 동일) */
export const STORE_DETAIL_HERO_SHELL_CLASS = "relative mt-0 w-full overflow-hidden aspect-[4/3]";

/**
 * WP7 (2026-10-30) — 메뉴 상세 사진 = 콘텐츠 폭 × 9/16 (16:9). `StoreProductDetailHeroMedia`·진입 스켈레톤 공통.
 */
export const STORE_PRODUCT_DETAIL_HERO_ASPECT_RATIO = "16 / 9";

/**
 * (레거시) clamp 박스 — WP7 이후 메뉴 상세는 `STORE_PRODUCT_DETAIL_HERO_ASPECT_RATIO` 를 쓴다.
 * 매장 화면 히어로는 4:3 (`STORE_DETAIL_HERO_ASPECT_RATIO`).
 */
export function storeDetailHeroMediaBoxStyle(extraRubberPx = 0): {
  height: string;
  minHeight: string;
} {
  const rubber = Math.max(0, Math.round(extraRubberPx));
  return {
    height: `calc(clamp(${STORE_DETAIL_HERO_CLAMP_MIN}, ${STORE_DETAIL_HERO_CLAMP_VH}, ${STORE_DETAIL_HERO_CLAMP_MAX}) + ${rubber}px)`,
    minHeight: `${STORE_DETAIL_HERO_MIN_HEIGHT_PX + rubber}px`,
  };
}
