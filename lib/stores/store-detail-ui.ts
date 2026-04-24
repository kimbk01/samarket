/**
 * Store detail (menu, info, reviews) shared layout / tab / section class tokens.
 */
export const STORE_DETAIL_BG = "bg-sam-app";

export const STORE_DETAIL_PAGE = `min-h-screen ${STORE_DETAIL_BG}`;

/** White card shell (menu, info, blog blocks) */
export const STORE_DETAIL_CARD =
  "rounded-ui-rect border border-stone-200 bg-white shadow-sm";

/** Horizontal page gutter (main body cards) */
export const STORE_DETAIL_GUTTER = "mx-4";

/** Menu / zone section title row */
export const STORE_DETAIL_SECTION_HEAD =
  "mb-3 flex items-center justify-center gap-2 px-1 text-center sam-text-body font-bold text-stone-800";

/** Info tab metric tile (visually aligned with store list chips) */
export const STORE_DETAIL_METRIC_TILE =
  "rounded-ui-rect border border-sam-border bg-background px-3 py-2.5";

/**
 * Sticky back + menu/info/review top bar: safe-area, light bg, border and blur.
 */
export const STORE_DETAIL_STICKY_HEADER =
  "sticky z-[35] rounded-ui-rect border-b border-stone-200 bg-white/80 shadow-sm backdrop-blur-md";

export const STORE_DETAIL_STICKY_TOP_SAFE = "top-[env(safe-area-inset-top,0px)]";

/**
 * `top` offset for the 2nd-row menu/category tab bar below Tier1 store header
 * (two-row when ordering: store row + menu/story/coupon row).
 */
export const STORE_DETAIL_MENU_STICKY_TOP_CLASS =
  "top-[calc(env(safe-area-inset-top,0px)+104px)]";

/** 2nd-depth subheader (product title, min order, zone title, report page, etc.) */
export const STORE_DETAIL_SUBHEADER_STICKY =
  "sticky z-[34] border-b border-gray-100 bg-white top-[calc(env(safe-area-inset-top,0px)+54px)]";
