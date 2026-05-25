/**
 * 앱 1단 헤더(뒤로·제목·우측 액션) — 거래·커뮤니티·메신저·내정보·매장·어드민 등 공통.
 * 햄버거(줄 3) 좌측 탐색 1단(`/philife`, 거래 홈·마켓)은 별도 레이아웃 — 변경 금지.
 *
 * 수치: `app/delivery-tokens.css` `--delivery-header-*` (48px / 40px 히트·4px gap 기본, `.delivery-ui` 36px·0px)
 */

/** 48px 한 줄 래퍼 (max-width·패딩) */
export const APP_TIER1_HEADER_ROW_WRAP_CLASS = [
  "mx-auto flex h-[length:var(--sector-header-h)] min-h-[length:var(--sector-header-h)] w-full max-w-[768px] items-center",
  "px-[length:var(--delivery-page-x)]",
  "[&>.sam-tier1-header__row]:h-full",
].join(" ");

export const APP_TIER1_HEADER_LAYOUT_ROW_CLASS =
  "sam-tier1-header__row h-full min-h-[length:var(--delivery-header-h)] w-full min-w-0";

export const APP_TIER1_HEADER_LEADING_CLASS = "sam-tier1-header__leading";
export const APP_TIER1_HEADER_TITLE_SLOT_CLASS = "sam-tier1-header__title-slot";
export const APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS = "sam-tier1-header__title";
export const APP_TIER1_HEADER_ACTIONS_CLASS = "sam-tier1-header__actions";
export const APP_TIER1_HEADER_ICON_BTN_CLASS = "sam-tier1-header__icon-btn";

/** SAM 서피스 1단 바 */
export const APP_TIER1_HEADER_BAR_CLASS =
  "w-full min-w-0 max-w-full shrink-0 sector-header-shell sector-header-shell--embedded";

/** 배달 소비자 — 기존 import 호환 */
export {
  APP_TIER1_HEADER_ROW_WRAP_CLASS as DELIVERY_CONSUMER_HEADER_ROW_CLASS,
  APP_TIER1_HEADER_LAYOUT_ROW_CLASS as DELIVERY_CONSUMER_HEADER_LAYOUT_ROW_CLASS,
  APP_TIER1_HEADER_LEADING_CLASS as DELIVERY_CONSUMER_HEADER_LEADING_CLASS,
  APP_TIER1_HEADER_TITLE_SLOT_CLASS as DELIVERY_CONSUMER_HEADER_TITLE_SLOT_CLASS,
  APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS as DELIVERY_CONSUMER_HEADER_TITLE_IN_SLOT_CLASS,
  APP_TIER1_HEADER_ACTIONS_CLASS as DELIVERY_CONSUMER_HEADER_ACTIONS_CLASS,
  APP_TIER1_HEADER_ICON_BTN_CLASS as DELIVERY_CONSUMER_HEADER_ICON_BTN_CLASS,
};
