/**
 * 매장 관리자(/my/business 및 하위) 화면에서
 * 섹션·블록 사이 세로 간격 — 20px 고정 (공통)
 */
export const OWNER_STORE_STACK_Y_CLASS = "space-y-[20px]";

/** input·textarea — 직각 모서리 (border-radius 0) */
export const OWNER_STORE_CONTROL_CLASS =
  "w-full min-w-0 rounded-none border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-900";

/** select — 동일 톤, 필리핀 폼과 동일 좌우 비율 그리드용 */
export const OWNER_STORE_SELECT_CLASS =
  "w-full min-w-0 rounded-none border border-gray-200 bg-white px-2 py-2.5 text-[14px] text-gray-900 sm:px-3 sm:text-[15px] disabled:opacity-60 disabled:bg-gray-50";

/** 2열 필드: 동일 폭·열 간격 16px */
export const OWNER_STORE_FORM_GRID_2_CLASS = "grid grid-cols-2 gap-x-4 gap-y-4";

/** ZIP 적용 등 보조 버튼 (입력과 같은 직각) */
export const OWNER_STORE_AUX_BUTTON_CLASS =
  "w-full rounded-none border border-gray-300 bg-white px-3 py-2.5 text-[13px] font-medium text-gray-800 active:bg-gray-50";

/** 같은 톤, `flex` 줄에서 `w-full` 없이 사용 */
export const OWNER_STORE_AUX_BUTTON_INLINE_CLASS =
  "shrink-0 rounded-none border border-gray-300 bg-white px-4 py-2.5 text-[13px] font-medium text-gray-800 active:bg-gray-50 disabled:opacity-50";

/** input·textarea (세로 패딩 약간 낮음) */
export const OWNER_STORE_CONTROL_COMPACT_CLASS =
  "w-full min-w-0 rounded-none border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900";

/** flex 행 안 textarea 등 — w-full 없음 */
export const OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS =
  "rounded-none border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-900";

/** 영업시간 시각 선택 버튼 */
export const OWNER_STORE_TIME_BLOCK_BUTTON_CLASS =
  "flex w-full min-w-0 items-center justify-center rounded-none border border-gray-200 bg-white px-3 py-3 text-[15px] font-semibold text-gray-900 active:bg-gray-50";
