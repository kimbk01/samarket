/**
 * 매장 상세 히어로 — QuickShell·PASS1 seed·summary API 동일 박스( CLS 방지 ).
 * 목록 카드(5:3)와 다르게 상세 전용 와이드 히어로 규격.
 */

export const STORE_DETAIL_HERO_CLAMP_MIN = "13rem";
export const STORE_DETAIL_HERO_CLAMP_VH = "44vh";
export const STORE_DETAIL_HERO_CLAMP_MAX = "18rem";
export const STORE_DETAIL_HERO_MIN_HEIGHT_PX = 208;

/** Tailwind — QuickShell shimmer·placeholder (StoreOrderHeroSummary 박스와 동일 clamp) */
export const STORE_DETAIL_HERO_SHELL_CLASS =
  "relative mt-0 w-full overflow-hidden h-[clamp(13rem,44vh,18rem)] min-h-[208px]";

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
