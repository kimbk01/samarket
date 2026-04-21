/**
 * 매장 관리자(/my/business 및 하위) 화면에서
 * 섹션·블록 사이 세로 간격 — 20px 고정 (공통)
 */
export const OWNER_STORE_STACK_Y_CLASS = "space-y-[20px]";

/** 구역 제목 — 지역·동네, ZIP, 「위치」 등 */
export const OWNER_STORE_FORM_LEAD_CLASS = "mb-2 block sam-text-body font-medium text-gray-800";

/** 개별 필드 라벨 (input/select/textarea 위) */
export const OWNER_STORE_FIELD_LABEL_CLASS = "mb-1 block sam-text-body font-medium text-gray-700";

/** 보조 안내 문구 */
export const OWNER_STORE_FORM_HINT_CLASS = "mb-2 sam-text-helper leading-relaxed text-gray-500";

/** input·textarea — 직각 모서리 (border-radius 0) */
export const OWNER_STORE_CONTROL_CLASS =
  "w-full min-w-0 rounded-ui-rect border border-gray-200 bg-white px-3 py-2.5 sam-text-body text-gray-900";

/** 상점 소개 등 — CONTROL과 동일 톤·모서리 */
export const OWNER_STORE_TEXTAREA_CLASS = `${OWNER_STORE_CONTROL_CLASS} min-h-[4.75rem] resize-y`;

/** select — 동일 톤, 필리핀 폼과 동일 좌우 비율 그리드용 */
export const OWNER_STORE_SELECT_CLASS =
  "w-full min-w-0 rounded-ui-rect border border-gray-200 bg-white px-2 py-2.5 sam-text-body text-gray-900 sm:px-3 sm:sam-text-body disabled:opacity-60 disabled:bg-gray-50";

/** 2열 필드: 동일 폭·열 간격 16px */
export const OWNER_STORE_FORM_GRID_2_CLASS = "grid grid-cols-2 gap-x-4 gap-y-4";

/** ZIP 적용 등 보조 버튼 (입력과 같은 직각) */
export const OWNER_STORE_AUX_BUTTON_CLASS =
  "w-full rounded-ui-rect border border-gray-300 bg-white px-3 py-2.5 sam-text-body-secondary font-medium text-gray-800 active:bg-gray-50";

/** 같은 톤, `flex` 줄에서 `w-full` 없이 사용 */
export const OWNER_STORE_AUX_BUTTON_INLINE_CLASS =
  "shrink-0 rounded-ui-rect border border-gray-300 bg-white px-4 py-2.5 sam-text-body-secondary font-medium text-gray-800 active:bg-gray-50 disabled:opacity-50";

/** 짧은 라벨(예: ZIP「적용」) — 입력 옆에 붙일 때 */
export const OWNER_STORE_AUX_BUTTON_INLINE_COMPACT_CLASS =
  "shrink-0 rounded-ui-rect border border-gray-300 bg-white px-3 py-2 sam-text-body-secondary font-medium text-gray-800 active:bg-gray-50 disabled:opacity-50";

/** input·textarea (세로 패딩 약간 낮음) */
export const OWNER_STORE_CONTROL_COMPACT_CLASS =
  "w-full min-w-0 rounded-ui-rect border border-gray-200 bg-white px-3 py-2 sam-text-body text-gray-900";

/** flex 행 안 textarea 등 — w-full 없음 */
export const OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS =
  "rounded-ui-rect border border-gray-200 bg-white px-3 py-2 sam-text-body text-gray-900";

/** 영업시간 시각 선택 버튼 */
export const OWNER_STORE_TIME_BLOCK_BUTTON_CLASS =
  "flex w-full min-w-0 items-center justify-center rounded-ui-rect border border-gray-200 bg-white px-3 py-3 sam-text-body font-semibold text-gray-900 active:bg-gray-50";
