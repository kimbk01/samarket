/**
 * 거래 피드 카드 썸네일 규격 단일 소스.
 * Marketplace product tile — 중고거래/중고차/부동산/환전/일자리/렌터카 동일 비율.
 *
 * LIST contract:
 * - thumbnail SLOT always present (geometry)
 * - real image only when available
 * - empty slot = 공통 「사진 없음」 대체 그래픽(`TradeNoPhotoPlaceholder`, P-4 Owner 승인 2026-10-27) — 빈 흰 칸 금지
 */
export const TRADE_FEED_THUMB_GEOMETRY_CLASS =
  "relative aspect-square w-full overflow-hidden rounded-ui-rect";

/** Image present — muted fill is only under the real image (loading backdrop), not fake media. */
export const TRADE_FEED_THUMB_BOX_CLASS = `${TRADE_FEED_THUMB_GEOMETRY_CLASS} bg-sam-surface-muted`;

/**
 * No-image LIST slot — same footprint as image cards. 칸 자체는 투명, 안에 `TradeNoPhotoPlaceholder` 1종.
 */
export const TRADE_FEED_THUMB_SLOT_EMPTY_CLASS = TRADE_FEED_THUMB_GEOMETRY_CLASS;

/** 썸네일 아래 메타 — 가격 → 제목 → 지역 */
export const TRADE_FEED_META_COLUMN_CLASS = "mt-1.5 flex min-w-0 flex-col gap-0.5";

export const TRADE_FEED_META_ROW_CLASS = "flex min-w-0 items-center overflow-hidden";

/**
 * v5 정형 카드 (Owner 2026-11-03 「v5대로 구현」 · `docs/audit/trade-list-new-badge-date-design-2026-11-03.md` D2)
 * 텍스트는 고정 높이 3줄 — 1줄 22px 가격+작성일 · 2줄 20px 제목 · 3줄 18px 지역·관심 N. 어떤 글도 줄이 늘지 않는다.
 */
export const TRADE_CARD_ROWS_CLASS = "mt-1.5 grid min-w-0 grid-rows-[22px_20px_18px] gap-y-px";
export const TRADE_CARD_ROW1_CLASS = "flex min-w-0 items-baseline justify-between gap-1.5 overflow-hidden";
/** 가격 16px/700 — 단일 가격은 잘리지 않고 작성일 쪽이 줄어든다 */
export const TRADE_CARD_PRICE_CLASS =
  "whitespace-nowrap text-[16px] font-bold leading-[22px] tabular-nums text-sam-fg";
export const TRADE_CARD_AGE_CLASS = "whitespace-nowrap text-[12px] font-normal leading-[22px] text-sam-muted";
export const TRADE_CARD_TITLE_CLASS = "min-w-0 truncate text-[14px] font-medium leading-5 text-sam-fg";
export const TRADE_CARD_META_CLASS =
  "flex min-w-0 items-center gap-[3px] overflow-hidden whitespace-nowrap text-[12px] font-normal leading-[18px] text-sam-muted";

/** 사진 왼쪽 위 상태 칩 1개 자리 (페이스북 「방금 등록된 품목」 칩 자리) */
const TRADE_CARD_CHIP_BASE_CLASS =
  "pointer-events-none absolute left-1.5 top-1.5 z-[2] inline-flex h-[22px] items-center rounded-ui-rect px-[7px] text-[12px] font-semibold leading-none";
export const TRADE_CARD_CHIP_NEW_CLASS = `${TRADE_CARD_CHIP_BASE_CLASS} bg-white/95 text-sam-fg shadow-[0_0_0_1px_rgba(0,0,0,0.06)]`;
export const TRADE_CARD_CHIP_AD_CLASS = `${TRADE_CARD_CHIP_BASE_CLASS} bg-sam-primary text-white`;

/** 판매자 광고 카드 — DIBAY 그린 3px 바깥선(카드 크기·칸 자리 변화 0, 2열 간격 10px 안) */
export const TRADE_CARD_PROMOTED_OUTLINE_CLASS = "rounded-[5px] outline-3 outline-offset-2 outline-sam-primary";

/** ⋮ 대신 길게 누름 — 누름 시간·이동 허용(넘으면 스크롤로 보고 취소) */
export const TRADE_CARD_LONG_PRESS_MS = 500;
export const TRADE_CARD_LONG_PRESS_MOVE_PX = 10;

/** 모바일 열 수 — 열 수를 읽기 전(서버·첫 그림) 광고 줄 계산 기본값(`useGridColumnCount`) */
export const TRADE_FEED_MOBILE_COLUMN_COUNT = 2;

/** 모바일 2열 · 태블릿 3열 · 와이드 4열 — 기존 메인 컬럼 셸 안에서만 */
export const TRADE_FEED_PRODUCT_GRID_CLASS =
  "grid grid-cols-2 gap-x-2.5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4 [&>li]:min-w-0";
