import {
  ADDR_SB_COFFEE,
  ADDR_SB_CREAM,
  ADDR_SB_GREEN,
  ADDR_SB_GREEN_DARK,
  ADDR_SB_MINT,
} from "@/lib/ui/address-list-starbucks-styles";

export {
  ADDR_SB_COFFEE,
  ADDR_SB_CREAM,
  ADDR_SB_GREEN,
  ADDR_SB_GREEN_DARK,
  ADDR_SB_MINT,
};

/** 프로필 수정 페이지 배경 */
export const PROFILE_EDIT_PAGE_BG_CLASS = "min-h-screen bg-[#F2F0EB]";

/** 본문 — 태블릿 max-width */
export const PROFILE_EDIT_BODY_CLASS = "mx-auto w-full min-w-0 max-w-[768px] px-4";

export const PROFILE_EDIT_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-[#00704A]/12 bg-white shadow-[0_1px_0_rgba(30,57,50,0.04)]";

export const PROFILE_EDIT_FIELD_LABEL_CLASS =
  "text-[12px] font-semibold uppercase tracking-wide text-[#6F4E37]";

export const PROFILE_EDIT_FIELD_CONTROL_CLASS =
  "w-full rounded-ui-rect border border-[#D4E9E2] bg-white px-3 py-2.5 text-[15px] font-medium text-[#1E3932] placeholder:text-[#6F4E37]/45 focus:border-[#00704A] focus:outline-none focus:ring-2 focus:ring-[#00704A]/15";

/** 필수 항목 미완료 — 빨간 외곽선 (완료 시 기본 border 로 복귀) */
export const PROFILE_EDIT_FIELD_INCOMPLETE_CLASS =
  "border-red-400 focus:border-red-500 focus:ring-red-200/80";

export const PROFILE_EDIT_ADDRESS_INCOMPLETE_CLASS =
  "border-red-400 bg-red-50/40 text-red-700";

/** 단독 필드(래퍼 없음) — 상단 여백 포함 */
export const PROFILE_EDIT_INPUT_CLASS = `mt-1 ${PROFILE_EDIT_FIELD_CONTROL_CLASS}`;

export const PROFILE_EDIT_TEXTAREA_CLASS = `${PROFILE_EDIT_INPUT_CLASS} min-h-[72px] resize-none leading-snug`;

/** 나의 상태 — 1행 시작, 엔터 시 AutoGrowTextarea 로 확장 */
export const PROFILE_EDIT_STATUS_TEXTAREA_CLASS = `${PROFILE_EDIT_FIELD_CONTROL_CLASS} min-h-[44px] leading-snug`;

export const PROFILE_EDIT_READONLY_VALUE_CLASS =
  "rounded-ui-rect border border-[#D4E9E2]/80 bg-[#F2F0EB]/60 px-3 py-2.5 text-[15px] font-medium text-[#6F4E37]";

export const PROFILE_EDIT_ROW_DIVIDER_CLASS = "border-t border-[#D4E9E2]/80";

export const PROFILE_EDIT_PRIMARY_BTN_CLASS =
  "inline-flex min-h-9 items-center justify-center rounded-ui-rect bg-[#00704A] px-4 text-[13px] font-bold text-white disabled:opacity-50";

export const PROFILE_EDIT_SECONDARY_BTN_CLASS =
  "inline-flex w-full items-center justify-center rounded-ui-rect border border-[#00704A]/25 bg-white py-3 text-[14px] font-semibold text-[#00704A] active:bg-[#E8F3EE]";

/** 고정 헤더 아래 본문 — `--sector-header-h`(52px) + safe-area */
export const PROFILE_EDIT_HEADER_BODY_OFFSET_CLASS =
  "pt-[calc(var(--safe-top)+var(--sector-header-h,52px))]";

