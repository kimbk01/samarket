/** `/stores` 홈 hub — delivery 토큰 기반 Tailwind 묶음 */

export const STORES_HOME_STACK = "flex flex-col gap-[var(--delivery-section-gap)]";

export const STORES_HOME_SECTION_TITLE =
  "text-[length:var(--delivery-fs-section-title)] font-bold leading-[var(--delivery-lh-section-title)] text-[color:var(--delivery-text-main)]";

export const STORES_HOME_PAGE_TITLE =
  "text-[18px] font-bold leading-[1.4] text-[color:var(--delivery-text-main)]";

export const STORES_HOME_STORE_NAME =
  "text-[15px] font-semibold leading-[1.4] text-[color:var(--delivery-text-main)]";

export const STORES_HOME_BODY =
  "text-[13px] font-normal leading-[1.45] text-[color:var(--delivery-text-main)]";

export const STORES_HOME_META =
  "text-[12px] font-normal leading-[1.4] text-[color:var(--delivery-text-sub)]";

export const STORES_HOME_LINK =
  "text-[13px] font-semibold text-[color:var(--delivery-primary)]";

export const STORES_HOME_CARD =
  "rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)]";

export const STORES_HOME_RAIL_SCROLL =
  "flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-overflow-scrolling:touch]";

/** 2차 업종 — 한 행 5개, 간격 `--delivery-home-subcategory-gap` */
export const STORES_HOME_SUB_CATEGORY_GRID =
  "grid grid-cols-5 gap-[var(--delivery-home-subcategory-gap)]";

export const STORES_HOME_SUB_CATEGORY_LINK =
  "group flex w-full min-w-0 flex-col items-center gap-1 py-0.5 text-center transition will-change-transform active:scale-[0.97]";

/** 홈 2차 업종 — 원형, 셀 너비에 맞춤(최대 `--delivery-home-subcategory-icon`) */
export const STORES_HOME_SUB_CATEGORY_IMAGE_FRAME =
  "flex aspect-square w-full max-w-[var(--delivery-home-subcategory-icon)] items-center justify-center overflow-hidden rounded-full bg-white shadow-sm dark:bg-[#2A2B2C]";

/** 1·2차 업종 메뉴 라벨 — 동일 폰트(색상은 부모·2차 전용 클래스) */
export const STORES_HOME_CATEGORY_LABEL =
  "block w-full min-w-0 px-0.5 text-center text-[length:var(--delivery-home-category-label-fs)] font-medium leading-[1.25] line-clamp-2";

export const STORES_HOME_SUB_CATEGORY_LABEL =
  "block w-full min-w-0 px-0.5 text-center text-[length:var(--delivery-home-category-label-fs)] font-bold leading-[1.25] line-clamp-2 text-[color:var(--delivery-text-sub)] dark:text-[#B8C0CA]";

/** 1차 업종 — 2차와 구분되는 하단 섹션(탭 세로 중앙) */
export const STORES_HOME_PRIMARY_CATEGORY_SECTION =
  "flex items-center border-t border-[color:var(--delivery-border-section)] bg-[#eac784] pt-[6px] pb-0 -mx-[var(--delivery-page-x)] px-[var(--delivery-page-x)]";

export const STORES_HOME_PRIMARY_CATEGORY_SCROLL =
  "flex w-full snap-x snap-mandatory items-center gap-3 overflow-x-auto overscroll-x-contain pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden";

export const STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON =
  "relative flex min-w-[52px] max-w-[68px] w-[60px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 px-0.5 pt-0 pb-0.5 text-center";

export const STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR =
  "pointer-events-none absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full";
