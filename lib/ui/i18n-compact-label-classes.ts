/**
 * 메인 5축(커뮤니티·거래·배달·메신저·내정보) — 모바일 390px 기준 짧은 탭·칩·카드 라벨.
 * font-size 12px · 4px radius(`rounded-ui-rect`) · 1~2줄 clamp.
 */

export const I18N_COMPACT_TABLIST_SCROLL =
  "flex snap-x snap-mandatory gap-0 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden";

export const I18N_COMPACT_TAB_BUTTON =
  "flex min-w-[52px] max-w-[68px] w-[60px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-ui-rect px-0.5 py-1.5 text-center";

export const I18N_COMPACT_TAB_ICON = "h-10 w-10 shrink-0 object-contain";

export const I18N_COMPACT_TAB_LABEL =
  "block w-full min-w-0 max-w-full truncate text-center text-[12px] font-semibold leading-[1.2] tracking-[-0.01em]";

export const I18N_COMPACT_CHIP_LABEL =
  "relative z-[1] block min-w-0 max-w-[min(10rem,38vw)] truncate px-0.5 text-[12px] font-semibold leading-[1.2]";

export const I18N_COMPACT_PILL_LABEL =
  "min-w-0 max-w-[9.5rem] truncate text-[12px] font-semibold leading-[1.2]";

export const I18N_COMPACT_SECTION_TITLE =
  "min-w-0 flex-1 truncate text-[12px] font-semibold leading-[1.2]";

export const I18N_COMPACT_SUB_CARD =
  "group flex h-[84px] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-ui-rect border border-sam-border bg-white p-2 text-center shadow-sm transition will-change-transform active:scale-[0.97] dark:border-[#3E4042] dark:bg-[#2A2B2C]";

export const I18N_COMPACT_SUB_CARD_ICON_WRAP = "flex h-11 w-11 shrink-0 items-center justify-center";

export const I18N_COMPACT_SUB_CARD_ICON = "h-10 w-10 object-contain";

export const I18N_COMPACT_SUB_CARD_LABEL =
  "block w-full min-w-0 px-0.5 text-center text-[12px] font-medium leading-[1.25] text-gray-700 line-clamp-2 dark:text-[#E4E6EB]";

export const I18N_COMPACT_NAV_LABEL =
  "block min-w-0 max-w-full truncate text-[11px] font-medium leading-none tracking-[-0.01em]";
