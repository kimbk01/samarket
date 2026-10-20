
/** 프로필 수정 페이지 배경 */
export const PROFILE_EDIT_PAGE_BG_CLASS = "min-h-screen bg-sam-app";

/** 본문 — 태블릿 max-width */
export const PROFILE_EDIT_BODY_CLASS = "mx-auto w-full min-w-0 max-w-[768px] px-4";

export const PROFILE_EDIT_CARD_CLASS =
  "overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface";

export const PROFILE_EDIT_FIELD_LABEL_CLASS =
  "text-[12px] font-semibold uppercase tracking-wide text-sam-muted";

export const PROFILE_EDIT_FIELD_CONTROL_CLASS =
  "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-[15px] font-medium text-sam-fg placeholder:text-sam-muted/45 focus:border-sam-primary focus:outline-none focus:ring-2 focus:ring-sam-primary/15";

/** 필수 항목 미완료 — 빨간 외곽선 (완료 시 기본 border 로 복귀) */
export const PROFILE_EDIT_FIELD_INCOMPLETE_CLASS =
  "border-sam-danger focus:border-sam-danger focus:ring-sam-danger/20";

export const PROFILE_EDIT_ADDRESS_INCOMPLETE_CLASS =
  "border-sam-danger bg-sam-danger-soft/40 text-sam-danger";

/** 단독 필드(래퍼 없음) — 상단 여백 포함 */
export const PROFILE_EDIT_INPUT_CLASS = `mt-1 ${PROFILE_EDIT_FIELD_CONTROL_CLASS}`;

export const PROFILE_EDIT_TEXTAREA_CLASS = `${PROFILE_EDIT_INPUT_CLASS} min-h-[72px] resize-none leading-snug`;

/** 나의 상태 — 1행 시작, 엔터 시 AutoGrowTextarea 로 확장 */
export const PROFILE_EDIT_STATUS_TEXTAREA_CLASS = `${PROFILE_EDIT_FIELD_CONTROL_CLASS} min-h-[44px] leading-snug`;

export const PROFILE_EDIT_READONLY_VALUE_CLASS =
  "rounded-ui-rect border border-sam-border-soft bg-sam-app/60 px-3 py-2.5 text-[15px] font-medium text-sam-muted";

export const PROFILE_EDIT_ROW_DIVIDER_CLASS = "border-t border-sam-border-soft";

export const PROFILE_EDIT_PRIMARY_BTN_CLASS =
  "inline-flex min-h-9 items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[13px] font-bold text-white disabled:opacity-50";

export const PROFILE_EDIT_SECONDARY_BTN_CLASS =
  "inline-flex w-full items-center justify-center rounded-ui-rect border border-sam-primary/25 bg-sam-surface py-3 text-[14px] font-semibold text-sam-primary active:bg-sam-pressed-surface";

/** 고정 헤더 아래 본문 — `--sector-header-h`(52px) + safe-area */
export const PROFILE_EDIT_HEADER_BODY_OFFSET_CLASS =
  "pt-[calc(var(--safe-top)+var(--sector-header-h,52px))]";

