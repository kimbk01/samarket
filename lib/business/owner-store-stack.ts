/**
 * 매장 관리자(/my/business 및 하위) 화면에서
 * 섹션·블록 사이 세로 간격 — 20px 고정 (공통)
 */
export const OWNER_STORE_STACK_Y_CLASS = "space-y-[20px]";

/** 구역 제목 — 지역·동네, ZIP, 「위치」 등 */
export const OWNER_STORE_FORM_LEAD_CLASS = "mb-2 block text-[13px] font-semibold text-sam-fg";

/** 개별 필드 라벨 (input/select/textarea 위) */
export const OWNER_STORE_FIELD_LABEL_CLASS = "mb-1 block text-[13px] font-semibold text-sam-fg";

/** 보조 안내 문구 */
export const OWNER_STORE_FORM_HINT_CLASS = "mb-2 text-[12px] font-normal leading-[1.4] text-sam-muted";

/** input·textarea — 직각 모서리 (border-radius 0) */
export const OWNER_STORE_CONTROL_CLASS =
  "sam-input w-full min-w-0 bg-white text-sam-fg";

/** 상점 소개 등 — CONTROL과 동일 톤·모서리 */
export const OWNER_STORE_TEXTAREA_CLASS = `${OWNER_STORE_CONTROL_CLASS} min-h-[4.75rem] resize-y`;

/** select — 동일 톤, 필리핀 폼과 동일 좌우 비율 그리드용 */
export const OWNER_STORE_SELECT_CLASS =
  "sam-select w-full min-w-0 bg-white text-sam-fg disabled:opacity-60 disabled:bg-gray-50";

/** 2열 필드: 동일 폭·열 간격 16px */
export const OWNER_STORE_FORM_GRID_2_CLASS = "grid grid-cols-2 gap-x-4 gap-y-4";

/** ZIP 적용 등 보조 버튼 (입력과 같은 직각) */
export const OWNER_STORE_AUX_BUTTON_CLASS =
  "sam-btn-secondary w-full";

/** 같은 톤, `flex` 줄에서 `w-full` 없이 사용 */
export const OWNER_STORE_AUX_BUTTON_INLINE_CLASS =
  "sam-btn-secondary shrink-0 disabled:opacity-50";

/** 짧은 라벨(예: ZIP「적용」) — 입력 옆에 붙일 때 */
export const OWNER_STORE_AUX_BUTTON_INLINE_COMPACT_CLASS =
  "sam-btn-secondary shrink-0 px-3 py-2 disabled:opacity-50";

/** input·textarea (세로 패딩 약간 낮음) */
export const OWNER_STORE_CONTROL_COMPACT_CLASS =
  "sam-input w-full min-w-0 bg-white text-sam-fg";

/** flex 행 안 textarea 등 — w-full 없음 */
export const OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS =
  "sam-input bg-white text-sam-fg";

/** 영업시간 시각 선택 버튼 */
export const OWNER_STORE_TIME_BLOCK_BUTTON_CLASS =
  "sam-btn-secondary flex w-full min-w-0 items-center justify-center bg-white text-sam-fg";
