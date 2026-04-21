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
