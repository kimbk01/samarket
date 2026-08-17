import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";

/** 레거시 상품 상세 — 거래 글은 `TRADE_POST_DETAIL_*` 우선 */
export const PRODUCT_DETAIL_BOTTOM_BAR = `fixed bottom-0 left-1/2 z-30 flex h-14 min-h-[52px] max-h-[60px] w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} -translate-x-1/2 items-center gap-2 border-t border-sam-border bg-sam-surface px-3 sm:px-4 md:px-5 safe-area-pb`;

export const PRODUCT_DETAIL_CTA_BUTTON =
  "flex min-h-[44px] w-full min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-signature py-3 text-center text-[16px] font-bold text-white disabled:opacity-50";

// --- 거래 상세(PostDetailView) 하단 — FB 마켓플레이스형 통일 (모바일·태블릿 동일 토큰) ---

/**
 * CONTRACT — visual `--safe-bottom`는 최하단 섹터에서 정확히 1회만.
 * - seller band 없음 → PRIMARY 가 bottom-most consumer
 * - seller band 있음 → SELLER BAND 만 bottom-most consumer (PRIMARY 에 safe 금지)
 * DO NOT: PRIMARY + SELLER 동시 `var(--safe-bottom)` · shell 에 추가 pb · 기기별 inset 분기
 */

/** 외곽 셸: 상단 그림자 — safe-area 는 자식 최하단 섹터에만 */
export const TRADE_POST_DETAIL_BOTTOM_SHELL = `fixed bottom-0 left-1/2 z-30 flex w-full ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} -translate-x-1/2 flex-col border-t border-sam-border bg-sam-surface shadow-[0_-2px_16px_rgba(15,20,25,0.07)] dark:border-sam-border dark:shadow-[0_-2px_14px_rgba(0,0,0,0.4)]`;

/** PRIMARY 공통 골격 (safe 제외) */
const TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_BASE =
  "flex min-h-[56px] w-full max-w-full items-stretch gap-0 sm:min-h-[58px] md:min-h-[60px]";

/**
 * 구매자·상대방 글 — PRIMARY 가 최하단 → safe-bottom 1회.
 */
export const TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW = `${TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_BASE} pb-[max(10px,var(--safe-bottom))]`;

/**
 * 판매자 밴드가 바로 아래 있을 때 — PRIMARY 에 safe 금지 (행 사이 dead space 0).
 */
export const TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_ABOVE_SELLER = `${TRADE_POST_DETAIL_BOTTOM_PRIMARY_ROW_BASE} pb-0`;

/** 관심 — 고정 폭 컬럼 (분기 공통) */
export const TRADE_POST_DETAIL_BOTTOM_FAVORITE_BTN =
  "flex w-[64px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-sam-border-soft bg-sam-surface py-2 text-sam-muted transition-colors hover:bg-sam-surface-muted active:bg-sam-border-soft sm:w-[72px]";

/** 부동산 하단 판매가 요약 칼럼 */
export const TRADE_POST_DETAIL_BOTTOM_RE_SUMMARY =
  "flex min-w-0 max-w-[44%] shrink-0 flex-col justify-center border-r border-sam-border-soft px-2.5 py-2 sm:max-w-[38%] sm:px-3 md:px-4";

/** CTA 묶음 (가격 제안·채팅 등) */
export const TRADE_POST_DETAIL_BOTTOM_ACTIONS_WRAP =
  "flex min-h-0 min-w-0 flex-1 items-stretch px-2.5 py-2 sm:px-3 md:px-4";

export const TRADE_POST_DETAIL_BOTTOM_ACTIONS_INNER =
  "flex min-h-[48px] w-full min-w-0 items-stretch gap-2 sm:gap-2.5 md:min-h-[50px]";

/** 메인 액션 (채팅) — 브랜드 블루 */
export const TRADE_POST_DETAIL_BOTTOM_PRIMARY_CTA =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-[10px] bg-sam-primary px-3 py-2.5 text-center text-[15px] font-semibold leading-tight text-sam-on-primary shadow-sm transition-colors hover:bg-sam-primary-hover disabled:pointer-events-none disabled:opacity-45 md:min-h-[50px]";

/** 보조 액션 (가격 제안하기 등) — 연회색 필 */
export const TRADE_POST_DETAIL_BOTTOM_SECONDARY_CTA =
  "flex min-h-[48px] min-w-0 flex-1 items-center justify-center rounded-[10px] border border-sam-border bg-sam-surface-muted px-3 py-2.5 text-center text-[15px] font-semibold leading-tight text-sam-fg transition-colors hover:bg-sam-border-soft active:bg-sam-border disabled:pointer-events-none disabled:opacity-45 md:min-h-[50px]";

/** 비활성·대기 상태 */
export const TRADE_POST_DETAIL_BOTTOM_MUTED_CTA =
  "flex min-h-[48px] min-w-0 flex-1 cursor-not-allowed items-center justify-center rounded-[10px] bg-sam-surface-muted px-3 py-2.5 text-center text-[15px] font-semibold leading-tight text-sam-muted md:min-h-[50px]";

/** 로딩 플레이스홀더 */
export const TRADE_POST_DETAIL_BOTTOM_LOADING_PLACEHOLDER =
  "flex min-h-[48px] flex-1 items-center justify-center rounded-[10px] border border-dashed border-sam-border bg-sam-app/80 px-3 sam-text-body-secondary text-sam-muted md:min-h-[50px]";

/**
 * 판매자 전용 두 번째 밴드 — 최하단 safe-bottom 1회 · PRIMARY 와 border 만으로 연결.
 * CTA min-h 48 유지 · pt compact (구 pt-3 → pt-2).
 */
export const TRADE_POST_DETAIL_BOTTOM_SELLER_BAND =
  "w-full border-t border-sam-border-soft bg-sam-surface-muted px-3 pb-[max(10px,var(--safe-bottom))] pt-2 sm:px-4 md:px-5";

/**
 * 본문 스크롤 reserve (overlay avoidance — bar 내부 visual safe 와 별개).
 * buyer: ~PRIMARY min-h + bottom-most safe
 * seller: PRIMARY + compact SELLER(pt-2+CTA) + bottom-most safe
 */
export const TRADE_POST_DETAIL_SCROLL_PAD_BUYER =
  "pb-[calc(3.75rem+max(10px,var(--safe-bottom)))]";

export const TRADE_POST_DETAIL_SCROLL_PAD_SELLER =
  "pb-[calc(7.25rem+max(10px,var(--safe-bottom)))]";

/** Seller band 실렌더 — CTA 0이면 band 0 (빈 회색 밴드 금지) */
export function tradePostDetailSellerBandVisible(opts: {
  showSellerOfferList: boolean;
  canApplyTradeAd: boolean;
}): boolean {
  return Boolean(opts.showSellerOfferList || opts.canApplyTradeAd);
}
