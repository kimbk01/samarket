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

/** 신청 폼(필수 입력) — 시각적으로 “입력칸” 강조 */
export const OWNER_STORE_CONTROL_REQUIRED_CLASS =
  "sam-input w-full min-w-0 border border-signature/35 bg-sam-app text-sam-fg shadow-sm focus:border-signature focus:ring-2 focus:ring-signature/25";

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

/**
 * 매장 설정(프로필) 입력 테두리 — `app/samarket-components.css` 의
 * `.sam-input.owner-store-profile-field-edge` / `.sam-select.owner-store-profile-field-edge` 와 짝.
 */
export const OWNER_STORE_PROFILE_FIELD_EDGE_CLASS = "owner-store-profile-field-edge";

/**
 * 프로필 폼 — 필드 라벨(입력 위 한 줄).
 */
export const OWNER_STORE_PROFILE_FIELD_LABEL_CLASS =
  "mb-2.5 block text-[13px] font-semibold leading-snug text-sam-fg";

/**
 * 프로필 폼 — 영업시간 등 묶음 패널(본문 안 서브 구역).
 */
export const OWNER_STORE_PROFILE_INNER_PANEL_CLASS =
  "space-y-4 rounded-ui-rect border border-sam-border-soft bg-sam-app/60 px-4 py-4 ring-1 ring-inset ring-sam-primary/[0.06] sm:px-4 sm:py-4";

/**
 * 프로필 상세 — 항목(라벨+입력) 단위 구역.
 */
export const OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS =
  "overflow-hidden rounded-ui-rect border border-sam-border bg-white px-4 pb-4 pt-0 ring-1 ring-inset ring-sam-primary/[0.07]";

/**
 * `OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS` 안 첫 줄 제목 — 섹션 카드 헤더와 동일 #DBEDF5.
 */
export const OWNER_STORE_PROFILE_FIELD_BLOCK_HEAD_CLASS =
  "-mx-4 mb-3 block rounded-t-ui-rect border-b border-sam-border-soft bg-[#dbedf5] px-4 py-2.5 text-[13px] font-semibold leading-snug text-sam-fg";

/** 매장 설정(프로필) — 단일행 시간 선택 등 입력과 동일 톤 */
export const OWNER_STORE_PROFILE_TIME_BUTTON_CLASS =
  `sam-input flex w-full min-w-0 items-center justify-center ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS} text-sam-fg`;

export const OWNER_STORE_PROFILE_CONTROL_CLASS =
  `${OWNER_STORE_CONTROL_COMPACT_CLASS} ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`;

export const OWNER_STORE_PROFILE_SELECT_CLASS =
  `${OWNER_STORE_SELECT_CLASS} ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`;

export const OWNER_STORE_PROFILE_TEXTAREA_BLOCK_CLASS =
  `${OWNER_STORE_CONTROL_COMPACT_BLOCK_CLASS} min-h-[4rem] w-full resize-y ${OWNER_STORE_PROFILE_FIELD_EDGE_CLASS}`;
