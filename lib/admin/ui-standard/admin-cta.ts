/**
 * Admin CTA 어휘 SSOT (수정 계획 2-1) — 같은 동작은 같은 단어. 화면 문구는 이 표에서만 가져온다.
 * 표 행 안 = 동사만(「승인」) · 헤더·상세 Drawer = 목적어+동사(「광고 승인」)는 호출부가 붙인다.
 * 금지 단어(`ADMIN_CTA_FORBIDDEN`)는 래칫 테스트가 표준 적용 화면에서 0건을 강제한다.
 * 클라이언트 안전.
 */

export const ADMIN_CTA = {
  search: { ko: "조회", en: "Search" },
  reset: { ko: "초기화", en: "Reset" },
  refresh: { ko: "새로고침", en: "Refresh" },
  save: { ko: "저장", en: "Save" },
  cancel: { ko: "취소", en: "Cancel" },
  create: { ko: "등록", en: "Create" },
  edit: { ko: "수정", en: "Edit" },
  approve: { ko: "승인", en: "Approve" },
  reject: { ko: "반려", en: "Reject" },
  hold: { ko: "보류", en: "Hold" },
  sanction: { ko: "제재", en: "Sanction" },
  liftSanction: { ko: "제재 해제", en: "Lift sanction" },
  exposeStart: { ko: "노출 시작", en: "Start exposure" },
  exposeStop: { ko: "노출 중지", en: "Stop exposure" },
  refund: { ko: "환불", en: "Refund" },
  payout: { ko: "지급", en: "Pay out" },
  delete: { ko: "삭제", en: "Delete" },
  exportCsv: { ko: "CSV 내보내기", en: "Export CSV" },
  detail: { ko: "상세", en: "Details" },
  close: { ko: "닫기", en: "Close" },
} as const;

export type AdminCtaKey = keyof typeof ADMIN_CTA;

export function adminCta(key: AdminCtaKey, ko: boolean): string {
  return ADMIN_CTA[key][ko ? "ko" : "en"];
}

/** 금지 단어 → 표준 단어. 래칫은 문자열 리터럴·JSX 텍스트로 쓰인 경우를 찾는다. */
export const ADMIN_CTA_FORBIDDEN: readonly { word: string; use: string }[] = [
  { word: "거절", use: "반려" },
  { word: "다시 시도", use: "새로고침" },
  { word: "재시도", use: "새로고침" },
  { word: "다시 불러오기", use: "새로고침" },
  { word: "리셋", use: "초기화" },
  { word: "엑셀", use: "CSV 내보내기" },
];

/** 단독 「검색」 버튼 금지 (검색 실행 = 「조회」). 「검색어」 같은 입력 라벨은 허용. */
export const ADMIN_CTA_FORBIDDEN_EXACT: readonly { word: string; use: string }[] = [
  { word: "검색", use: "조회" },
  { word: "확인", use: "동작 단어 (저장·승인 등)" },
];
