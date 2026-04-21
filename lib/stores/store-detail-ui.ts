/**
 * 매장 상세(메뉴·정보·리뷰) 공통 표면 — 탭 간 동일 톤.
 */
export const STORE_DETAIL_BG = "bg-[#f5f5f5]";

export const STORE_DETAIL_PAGE = `min-h-screen ${STORE_DETAIL_BG}`;

/** 흰 카드(메뉴 행·정보 블록 공통) */
export const STORE_DETAIL_CARD =
  "rounded-ui-rect border border-stone-200 bg-white shadow-sm";

/** 가로 여백(본문 카드용) */
export const STORE_DETAIL_GUTTER = "mx-4";

/** 메뉴 섹션 제목과 동일 톤의 구역 제목 */
export const STORE_DETAIL_SECTION_HEAD =
  "mb-3 flex items-center justify-center gap-2 px-1 text-center sam-text-body font-bold text-stone-800";

/** 정보 탭 지표 칩(메뉴 리스트와 동일 보더 톤) */
export const STORE_DETAIL_METRIC_TILE =
  "rounded-ui-rect border border-sam-border bg-background px-3 py-2.5";

/**
 * 뒤로가기 줄 + 메뉴·정보·리뷰 탭(+칩) — 연한 반투명 흰 배경, 하단 보더 동일.
 */
export const STORE_DETAIL_STICKY_HEADER =
  "sticky z-[35] rounded-ui-rect border-b border-stone-200 bg-white/80 shadow-sm backdrop-blur-md";

export const STORE_DETAIL_STICKY_TOP_SAFE = "top-[env(safe-area-inset-top,0px)]";

/**
 * Tier1 매장 스티키 바(주문 헤더 2줄: 매장·액션 + 상태·수령·검색) 아래 — 검색·카테고리 탭
 */
export const STORE_DETAIL_MENU_STICKY_TOP_CLASS =
  "top-[calc(env(safe-area-inset-top,0px)+104px)]";

/** 매장 1단 스티키 바로 아래 고정하는 2단 헤더(상품명·장바구니 제목 등) */
export const STORE_DETAIL_SUBHEADER_STICKY =
  "sticky z-[34] border-b border-gray-100 bg-white top-[calc(env(safe-area-inset-top,0px)+54px)]";
