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

/** 2차 업종 — 한 행 가로 스와이프(화면에 5개 노출, 나머지 스크롤) */
export const STORES_HOME_SUB_CATEGORY_RAIL =
  "flex w-full gap-[var(--delivery-home-subcategory-gap)] overflow-x-auto overscroll-x-contain pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden";

/** @deprecated — `STORES_HOME_SUB_CATEGORY_RAIL` */
export const STORES_HOME_SUB_CATEGORY_GRID = STORES_HOME_SUB_CATEGORY_RAIL;

/** 2차 업종 — 스크롤 본문 최상단(헤더 바로 아래, 여백·translate 없음) */
export const STORES_HOME_SUB_CATEGORY_SECTION_BODY =
  "bg-[color:var(--delivery-bg-card)] px-[var(--delivery-page-x)] pb-2 pt-0 border-b border-[color:var(--delivery-border-section)] w-full shrink-0";

/** 2차 슬라이드 전환 래퍼 */
export const STORES_HOME_SUB_CATEGORY_SLIDE_STAGE =
  "relative w-full overflow-hidden";

export const STORES_HOME_SUB_CATEGORY_SLIDE_LAYER =
  "w-full shrink-0";

/** 1차 업종 stickyBelow — 헤더 바로 아래 고정 */
export const STORES_HOME_CATEGORY_STICKY_STACK = "relative z-0 w-full shrink-0";

export const STORES_HOME_SUB_CATEGORY_LINK =
  "group flex w-[calc((100%-4*var(--delivery-home-subcategory-gap))/5)] min-w-[calc((100%-4*var(--delivery-home-subcategory-gap))/5)] shrink-0 flex-col items-center gap-1 py-0.5 text-center transition-opacity touch-manipulation select-none [-webkit-tap-highlight-color:transparent] active:opacity-80";

/** 홈 2차 업종 — 원형, 셀 너비에 맞춤(최대 `--delivery-home-subcategory-icon`) */
export const STORES_HOME_SUB_CATEGORY_IMAGE_FRAME =
  "flex aspect-square w-full max-w-[var(--delivery-home-subcategory-icon)] items-center justify-center overflow-hidden rounded-full bg-[color:var(--delivery-bg-card)] shadow-sm";

export const STORES_HOME_SUB_CATEGORY_LABEL =
  "block w-full min-w-0 px-0.5 text-center text-[length:var(--delivery-home-category-label-fs)] font-bold leading-[1.25] line-clamp-2 text-[color:var(--delivery-text-sub)]";

/** 1·2차 업종 메뉴 라벨 — 동일 폰트(색상은 부모·2차 전용 클래스) */
export const STORES_HOME_CATEGORY_LABEL =
  "block w-full min-w-0 px-0.5 text-center text-[length:var(--delivery-home-category-label-fs)] font-medium leading-[1.25] line-clamp-2";

/** 1차 업종 — 탭 하단·세로 스크롤 우선 */
export const STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY =
  "relative z-[2] flex items-center border-t border-[color:var(--delivery-border-section)] bg-[color:var(--dibay-gold)] px-[var(--delivery-page-x)] pt-1.5 pb-1";

/** 1차 업종 — 스크롤 본문(2차 바로 아래, 2차 보일 때만) */
export const STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY = "w-full shrink-0";

/** 2차 숨김 후 헤더 stickyBelow 고정 1차 */
export const STORES_HOME_PRIMARY_CATEGORY_SECTION_HEADER_STICKY =
  "relative z-[2] w-full shrink-0 shadow-[0_2px_6px_color-mix(in_srgb,var(--dibay-brown)_8%,transparent)]";

/** @deprecated — scroll-body `STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY` + header stickyBelow */
export const STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_STICKY =
  STORES_HOME_PRIMARY_CATEGORY_SECTION_SCROLL_BODY;

export const STORES_HOME_PRIMARY_CATEGORY_SCROLL =
  "flex w-full items-center gap-2.5 overflow-x-auto overscroll-x-contain pb-0 [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden";

/** 1차 업종 — 선택 전: 가로 스크롤 잠금(세로 페이지 스크롤만) */
export const STORES_HOME_PRIMARY_CATEGORY_SCROLL_LOCKED =
  "flex w-full items-center gap-2.5 overflow-x-hidden overscroll-x-none pb-0";

export const STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON =
  "relative flex min-w-[48px] max-w-[62px] w-[56px] shrink-0 flex-col items-center justify-end gap-0.5 px-0.5 pt-0 pb-0 text-center transition-colors touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";

/** 1차 업종 — compact 아이콘 슬롯(선택 시 scale 만 변경) */
export const STORES_HOME_PRIMARY_CATEGORY_ICON_SLOT =
  "flex h-[calc(var(--delivery-home-category-icon-compact)*1.1)] w-full items-center justify-center";

export const STORES_HOME_PRIMARY_CATEGORY_ICON_INNER =
  "h-[var(--delivery-home-category-icon-compact)] w-[var(--delivery-home-category-icon-compact)] shrink-0 overflow-hidden rounded-full transition-transform duration-150 ease-out";

export const STORES_HOME_PRIMARY_CATEGORY_LABEL_SELECTED =
  "block w-full min-w-0 px-0.5 text-center text-[11px] font-extrabold leading-[1.25] line-clamp-2 text-[color:var(--delivery-text-main)]";

export const STORES_HOME_PRIMARY_CATEGORY_LABEL_IDLE =
  "block w-full min-w-0 px-0.5 text-center text-[11px] font-semibold leading-[1.25] line-clamp-2 text-[color:var(--delivery-text-sub)]";

/** browse·row 카드 메뉴 타일 — `store-facebook-feed-tokens` 와 동기 */
export const STORES_HOME_MENU_TILE = "rounded-[10px] bg-[color:var(--delivery-bg-thumb)]";
export const STORES_HOME_MENU_TILE_MORE =
  "rounded-[10px] bg-[color:var(--delivery-bg-soft)] text-[color:var(--delivery-text-main)] transition-[transform,opacity,background-color] duration-120 active:scale-[0.98] active:bg-[color:var(--delivery-bg-muted)]";

/** 1차 업종 — 선택 탭 하단 라인(기본 대비 굵기·너비 +10%) */
export const STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR =
  "block h-[3.3px] w-[calc(2.75rem*1.1)] shrink-0 rounded-full bg-[color:var(--delivery-primary)]";

export const STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR_IDLE =
  "block h-[3.3px] w-[calc(2.75rem*1.1)] shrink-0 rounded-full bg-transparent";
