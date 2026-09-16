/**
 * 거래 피드 카드 썸네일 규격 단일 소스.
 * Marketplace product tile — 중고거래/중고차/부동산/환전/일자리/렌터카 동일 비율.
 *
 * LIST contract:
 * - thumbnail SLOT always present (geometry)
 * - real image only when available
 * - empty slot = no img, no placeholder, no ivory fill
 */
export const TRADE_FEED_THUMB_GEOMETRY_CLASS =
  "relative aspect-square w-full overflow-hidden rounded-ui-rect";

/** Image present — muted fill is only under the real image (loading backdrop), not fake media. */
export const TRADE_FEED_THUMB_BOX_CLASS = `${TRADE_FEED_THUMB_GEOMETRY_CLASS} bg-sam-surface-muted`;

/**
 * No-image LIST slot — same footprint as image cards.
 * Transparent / normal card surface; never ivory or placeholder chrome.
 */
export const TRADE_FEED_THUMB_SLOT_EMPTY_CLASS = TRADE_FEED_THUMB_GEOMETRY_CLASS;

/** 썸네일 아래 메타 — 가격 → 제목 → 지역 */
export const TRADE_FEED_META_COLUMN_CLASS = "mt-1.5 flex min-w-0 flex-col gap-0.5";

export const TRADE_FEED_META_ROW_CLASS = "flex min-w-0 items-center overflow-hidden";

/** 모바일 2열 · 태블릿 3열 · 와이드 4열 — 기존 메인 컬럼 셸 안에서만 */
export const TRADE_FEED_PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-2.5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 [&>li]:min-w-0";
