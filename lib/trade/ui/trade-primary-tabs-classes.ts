/**
 * TRADE 메뉴 탭(`TradePrimaryTabs`) 전용 Tailwind 클래스 — 컴포넌트와 스타일 분리.
 */

export const TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS =
  "flex max-w-full min-w-0 flex-nowrap gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const TRADE_PRIMARY_COMMUNITY_ROW1_SCROLL_NAV_CLASS =
  "flex w-full max-w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const TRADE_PRIMARY_TABS_ROW_CLASS = "flex h-[55px] items-stretch";

/** orders-like 행: 가로 스크롤 + iOS 관성 스크롤 */
export const TRADE_PRIMARY_TABS_OUTER_SCROLL_CLASS =
  "w-full min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

export const TRADE_PRIMARY_TABS_EMBED_SCROLL_SHELL_CLASS =
  "relative flex flex-shrink-0 items-center gap-1 overflow-x-auto bg-sam-surface-muted scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const TRADE_PRIMARY_TABS_STICKY_FALLBACK_SHELL_CLASS =
  "sticky top-14 z-10 flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b border-sam-border bg-sam-surface-muted py-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** 거래 1차 탭 알약 — 배경은 `.sam-trade-primary-tab__wipe` 로 방향 덮어쓰기 */
export const TRADE_PRIMARY_TAB_PILL_SHELL =
  "relative inline-flex min-h-8 max-w-[min(12rem,45vw)] shrink-0 items-center justify-center gap-0.5 overflow-hidden rounded-full border-0 bg-transparent px-2.5 py-1 text-left text-[length:calc(14px-1pt)] transition-[color] duration-200 ease-out";

export const TRADE_PRIMARY_TAB_LABEL_IDLE = "font-extrabold text-sam-fg";

export const TRADE_PRIMARY_TAB_LABEL_ACTIVE = "font-extrabold text-sam-primary";
