import {
  ADDR_SB_COFFEE,
  ADDR_SB_CREAM,
  ADDR_SB_GREEN,
  ADDR_SB_GREEN_DARK,
  ADDR_SB_MINT,
} from "@/lib/ui/address-list-starbucks-styles";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

export {
  ADDR_SB_COFFEE,
  ADDR_SB_CREAM,
  ADDR_SB_GREEN,
  ADDR_SB_GREEN_DARK,
  ADDR_SB_MINT,
};

/**
 * 내정보 홈 page/shell surface — domain pale SSOT (`--dibay-domain-surface` = mypage #F3F2EB).
 * Do not use hard-coded #F2F0EB (creates cream band under Header).
 */
export const MYPAGE_HOME_PAGE_BG_CLASS =
  "min-h-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg,#F3F2EB))]";

/** 내정보 홈 — 하단 탭 clearance(`MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS`) re-export */
export { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS as MYPAGE_HOME_BOTTOM_NAV_CLEARANCE_CLASS };

/**
 * 모바일·태블릿 본문 — top inset authority = `pt-1` (feed stack parity).
 * DO NOT: negative margin / translateY to “close blank”.
 */
export const MYPAGE_HOME_BODY_CLASS =
  `mx-auto w-full min-w-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} px-4 pt-1 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`;

export const MYPAGE_HOME_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-[#00704A]/12 bg-white shadow-[0_1px_0_rgba(30,57,50,0.04)]";

/** 프로필 카드 — 대표 주소 행과 동일 좌측 그린 액센트 */
export const MYPAGE_HOME_PROFILE_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-[#00704A]/22 bg-white shadow-[inset_3px_0_0_0_#00704A,0_1px_0_rgba(30,57,50,0.04)]";

export const MYPAGE_HOME_SECTION_LABEL_CLASS =
  "text-[11px] font-bold uppercase tracking-[0.08em] text-[#6F4E37]";

export const MYPAGE_HOME_SECTION_HEADER_CLASS =
  "border-b border-[#D4E9E2]/80 px-4 py-2.5 sm:px-5";

export const MYPAGE_HOME_PROFILE_NAME_CLASS =
  "text-[20px] font-bold leading-tight tracking-tight text-[#1E3932]";

export const MYPAGE_HOME_HANDLE_CLASS =
  "font-mono text-[12px] font-medium leading-snug tabular-nums text-[#6F4E37]/90";

export const MYPAGE_HOME_BODY_TEXT_CLASS =
  "text-[13px] font-normal leading-snug text-[#6F4E37]";

export const MYPAGE_HOME_MENU_TITLE_CLASS = "truncate text-[15px] font-semibold leading-snug text-[#1E3932]";

export const MYPAGE_HOME_META_TEXT_CLASS =
  "text-[12px] font-medium leading-snug text-[#6F4E37]";

export const MYPAGE_HOME_STAT_LABEL_CLASS =
  "line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-[#6F4E37]";

export const MYPAGE_HOME_STAT_VALUE_CLASS =
  "mt-1 text-[18px] font-bold leading-tight tabular-nums text-[#1E3932]";

export const MYPAGE_HOME_STAT_VALUE_ACCENT_CLASS =
  "mt-1 text-[18px] font-bold leading-tight tabular-nums text-[#00704A]";

export const MYPAGE_HOME_ROW_CLASS =
  "flex min-h-[52px] w-full min-w-0 items-center gap-3 px-4 transition-colors hover:bg-[#F2F0EB]/60 active:bg-[#E8F3EE] sm:px-5";

export const MYPAGE_HOME_ROW_DIVIDER_CLASS = "border-t border-[#D4E9E2]/80";

export const MYPAGE_HOME_ICON_WRAP_CLASS =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D4E9E2] text-[#00704A]";

export const MYPAGE_HOME_CHEVRON_CLASS = "h-[18px] w-[18px] shrink-0 text-[#6F4E37]/45";

export const MYPAGE_HOME_ADDRESS_ROW_CLASS =
  "flex w-full min-w-0 items-start gap-2 rounded-ui-rect border border-[#00704A]/18 bg-[#E8F3EE]/70 px-3 py-2.5 text-left transition-colors hover:border-[#00704A]/30 hover:bg-[#E8F3EE] active:bg-[#D4E9E2]/80";

export const MYPAGE_HOME_CARD_PAD_CLASS = "p-4 sm:p-5";

export const MYPAGE_HOME_CARD_FOOTER_CLASS =
  "flex min-h-[52px] items-stretch gap-2 border-t border-[#D4E9E2]/80 px-4 py-3 sm:px-5";

export const MYPAGE_HOME_OUTLINE_BTN_CLASS =
  "inline-flex min-h-[40px] flex-1 items-center justify-center rounded-ui-rect border border-[#00704A]/25 bg-white px-3 text-[13px] font-semibold text-[#00704A] transition-colors hover:bg-[#E8F3EE] active:bg-[#D4E9E2]";

export const MYPAGE_HOME_GHOST_BTN_CLASS =
  "inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-ui-rect px-3 text-[13px] font-medium text-[#6F4E37] transition-colors hover:bg-[#F2F0EB] hover:text-[#C0392B] active:bg-[#E8E4DE]";

export const MYPAGE_HOME_DANGER_TEXT_CLASS = "text-[#C0392B]";

export const MYPAGE_HOME_STAT_GRID_CLASS = "grid grid-cols-2 gap-px bg-[#D4E9E2]/60 md:grid-cols-5";

export const MYPAGE_HOME_QUICK_GRID_CLASS = "grid grid-cols-5 gap-px bg-[#D4E9E2]/60";

export const MYPAGE_HOME_QUICK_ICON_CELL_CLASS =
  "flex min-h-[88px] flex-col items-center justify-center gap-1.5 bg-white px-1 py-3 text-center transition-colors hover:bg-[#F2F0EB]/50 active:bg-[#E8F3EE]";

export const MYPAGE_HOME_QUICK_ICON_WRAP_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4E9E2] text-[#00704A]";

export const MYPAGE_HOME_QUICK_ICON_LABEL_CLASS =
  "line-clamp-2 text-[10px] font-semibold leading-tight text-[#1E3932]";

export const MYPAGE_HOME_STAT_CELL_CLASS =
  "flex min-h-[76px] flex-col justify-center bg-white px-3 py-3 transition-colors hover:bg-[#F2F0EB]/50 active:bg-[#E8F3EE]";

/** 내정보 홈 — 언어 세그먼트(한글/English) */
export const MYPAGE_HOME_SEGMENT_WRAP_CLASS =
  "inline-flex shrink-0 rounded-ui-rect border border-[#00704A]/18 bg-[#F2F0EB] p-0.5";

export const MYPAGE_HOME_SEGMENT_BTN_CLASS =
  "min-h-[32px] min-w-[56px] rounded-ui-rect px-2.5 text-[12px] font-semibold leading-none transition-colors";

export const MYPAGE_HOME_SEGMENT_BTN_ACTIVE_CLASS = "bg-[#00704A] text-white shadow-sm";

export const MYPAGE_HOME_SEGMENT_BTN_INACTIVE_CLASS = "text-[#6F4E37] hover:bg-white/70 hover:text-[#1E3932]";
