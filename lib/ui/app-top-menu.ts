/**
 * 동네생활(/community) 상단 섹션 탭 타이포·pill을 앱 공통 상단 가로 메뉴 기준으로 사용.
 */
const APP_TOP_MENU_ROW1_CORE =
  "shrink-0 px-4 py-2 text-[13px] font-semibold transition";

export const APP_TOP_MENU_ROW1_BASE = `${APP_TOP_MENU_ROW1_CORE} rounded-full`;

/** 구매 내역 하위 탭 등 — border-radius 4px */
export const APP_TOP_MENU_ROW1_BASE_RADIUS_4 = `${APP_TOP_MENU_ROW1_CORE} rounded-[4px]`;

export const APP_TOP_MENU_ROW1_ACTIVE = "bg-gray-900 text-white";

export const APP_TOP_MENU_ROW1_INACTIVE = "bg-gray-100 text-gray-600 hover:bg-gray-200";

/** 2줄: 정렬·주제 칩 (동네생활 주제 줄과 동일 크기·굵기) */
export const APP_TOP_MENU_ROW2_BASE =
  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition whitespace-nowrap";

export const APP_TOP_MENU_ROW2_INACTIVE_SKY = "bg-sky-50 text-sky-900 hover:bg-sky-100";

/**
 * 마켓 거래 리스트 1·2행 — 피드 카드 하단 메타(위치·시간)와 동일 톤(text-[12px] #999), 배경 박스 없음
 */
export const APP_MARKET_MENU_TEXT_BASE =
  "shrink-0 whitespace-nowrap rounded-md px-2 py-1.5 text-[12px] transition-colors";

export const APP_MARKET_MENU_TEXT_ACTIVE = "font-semibold text-gray-900";

export const APP_MARKET_MENU_TEXT_INACTIVE =
  "font-normal text-[#8E8E8E] hover:text-[#262626]";
