/**
 * 배민 미러링 — 배달 홈·메뉴 페이지 헤더 실측값 (CSS px = dp).
 * 근거: 배민 16.28.0 샤오미 실측 (2026-10-30 15:04~15:32 PHT), 색만 DIBAY 고유색.
 * 설계: docs/audit/delivery-baemin-mirror-design-v6-2026-10-30.html §1·§3
 */

/** DIBAY 고유색 */
export const MIRROR_GREEN = "#0B421A";
export const MIRROR_GOLD = "#EAC784";
export const MIRROR_BROWN = "#362415";
/** 배민 실측 회색 — 미선택 페이지 탭 #7E8082, 미선택 상단 탭 #B1B3B5, 구분선·칩 테두리 #E4E6E8, 섹션 띠 #F3F5F7 */
export const MIRROR_MUTED = "#7E8082";
export const MIRROR_TOP_TAB_MUTED = "#B1B3B5";
export const MIRROR_DIVIDER = "#E4E6E8";
export const MIRROR_SECTION_BAND = "#F3F5F7";

/** 1단 공통 헤더 54 · 2단 주소줄 32 · 3단 메뉴 탭 40 · 4단 칩 줄 58(칩 36) */
export const MIRROR_HEADER_ROW_H_PX = 54;
export const MIRROR_ADDRESS_ROW_H_PX = 32;
export const MIRROR_PAGE_TAB_ROW_H_PX = 40;
export const MIRROR_CHIP_ROW_H_PX = 58;
export const MIRROR_CHIP_H_PX = 36;

/** 1단 — 흰 바탕 · 아래선 없음 */
export const MIRROR_HEADER_SHELL_CLASS = "delivery-ui relative w-full shrink-0 bg-white text-[color:#362415]";
export const MIRROR_HEADER_ROW_CLASS =
  "mx-auto grid h-[54px] w-full min-w-0 max-w-[768px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 px-[var(--delivery-page-x)]";
export const MIRROR_HEADER_TITLE_CLASS =
  "flex h-full min-w-0 items-center truncate text-[20px] font-extrabold leading-none tracking-[-0.4px] text-[color:#362415]";

/** 2단 — 주소 「… ▾」 14px 보통 (배민 실측 글자 높이 17px÷1.33 · DIBAY 15px 탭 대비 환산) */
export const MIRROR_ADDRESS_ROW_CLASS =
  "mx-auto flex h-[32px] w-full min-w-0 max-w-[768px] items-center px-[var(--delivery-page-x)] bg-white";
export const MIRROR_ADDRESS_BUTTON_CLASS =
  "inline-flex min-w-0 max-w-full items-center gap-1 text-[14px] font-normal leading-none text-[color:#362415] active:opacity-70";

/** 3단 — 흰 바탕 · 아래선 1px #E4E6E8 · 고른 탭 갈색 굵게 + 녹색 밑줄 2px · 나머지 #7E8082 보통 · 16px · 간격 20px */
export const MIRROR_PAGE_TABS_ROW_CLASS =
  "relative z-[1] w-full shrink-0 border-b border-[color:#E4E6E8] bg-white";
export const MIRROR_PAGE_TAB_BUTTON_BASE_CLASS =
  "relative flex h-[40px] shrink-0 items-center px-[10px] text-[16px] leading-none transition-colors duration-150";
export const MIRROR_PAGE_TAB_ON_CLASS = "font-bold text-[color:#362415]";
export const MIRROR_PAGE_TAB_OFF_CLASS = "font-normal text-[color:#7E8082]";
/** 오른쪽 끝 ⌄ 원형 버튼 (메뉴 전체보기) — 테두리 #E4E6E8 */
export const MIRROR_PAGE_TABS_MORE_BUTTON_CLASS =
  "absolute right-[var(--delivery-page-x)] top-1/2 z-[2] flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-full border border-[color:#E4E6E8] bg-white text-[color:#362415] shadow-[-8px_0_8px_rgba(255,255,255,0.95)] active:bg-[#F3F5F7]";

/** 4단 — 흰 줄 58 · 칩 36 알약 · 테두리 1.5px #E4E6E8 · 15px · 간격 10px */
export const MIRROR_CHIP_ROW_CLASS =
  "flex h-[58px] w-full min-w-0 items-center gap-[10px] overflow-x-auto overscroll-x-contain bg-white px-[var(--delivery-page-x)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
export const MIRROR_CHIP_BASE_CLASS =
  "inline-flex h-[36px] shrink-0 items-center gap-1 rounded-full border-[1.5px] px-[12px] text-[15px] leading-none transition-colors";
export const MIRROR_CHIP_OFF_CLASS = "border-[color:#E4E6E8] bg-white font-normal text-[color:#362415] active:bg-[#F3F5F7]";
/** 정렬 칩 — 테두리·글씨 녹색 굵게 + 아래 그림자 (배민: 기본순 칩만 진한 테두리·그림자) */
export const MIRROR_CHIP_SORT_CLASS =
  "border-[color:#0B421A] bg-white font-bold text-[color:#0B421A] shadow-[0_2px_4px_rgba(0,0,0,0.08)]";
/** 필터가 걸린 칩 — 녹색 채움 */
export const MIRROR_CHIP_ACTIVE_CLASS = "border-[color:#0B421A] bg-[#0B421A] font-bold text-white";

/** 시트 — 위 모서리 14 · 줄 66 · 뒤 어둡게 45% */
export const MIRROR_SHEET_BACKDROP_CLASS = "fixed inset-0 z-[80] bg-black/45";
export const MIRROR_SHEET_PANEL_CLASS =
  "fixed inset-x-0 bottom-0 z-[81] mx-auto w-full max-w-[768px] rounded-t-[14px] bg-white pb-[var(--safe-bottom,0px)] shadow-[0_-4px_16px_rgba(0,0,0,0.12)]";
export const MIRROR_SHEET_TITLE_CLASS = "flex h-[52px] items-center justify-center text-[15px] font-normal text-[color:#7E8082]";
export const MIRROR_SHEET_ROW_CLASS =
  "flex h-[66px] w-full items-center justify-between px-[20px] text-left text-[17px] text-[color:#362415] active:bg-[#F3F5F7]";
export const MIRROR_SHEET_FOOTER_CLASS = "flex h-[56px] border-t border-[color:#E4E6E8]";
