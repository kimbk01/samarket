/**
 * 일자리(당근 스타일) — 구인(hire) / 구직(work) · 메타 키와 UI 옵션
 */

/** 글 성격: 구인 vs 구직 (meta.listing_kind) */
export const JOB_LISTING_KIND_OPTIONS = [
  { value: "hire" as const, label: "사람 구해요" },
  { value: "work" as const, label: "일 찾고 있어요" },
];

export type JobListingKind = (typeof JOB_LISTING_KIND_OPTIONS)[number]["value"];

export const JOB_LISTING_KIND_LABELS: Record<string, string> = {
  hire: "사람구해요",
  work: "일찾아요",
};

/** 근무 형태: 단기 / 장기 / 하루 (meta.work_term) */
export const JOB_WORK_TYPE_OPTIONS = [
  { value: "short", label: "단기" },
  { value: "long", label: "장기" },
  { value: "one_day", label: "하루" },
] as const;

/** 급여 형태 — 시급/일급/건당 중심 */
export const PAY_TYPE_OPTIONS = [
  { value: "hourly", label: "시급" },
  { value: "daily", label: "일급" },
  { value: "per_task", label: "건당" },
] as const;

/** 업종 칩 — `WORK_CATEGORY_OTHER` 선택 시 `work_category_other` 메타에 상세 입력 */
export const WORK_CATEGORY_OTHER = "기타";
export const WORK_CATEGORY_OTHER_MAX = 40;

export const WORK_CATEGORY_OPTIONS = [
  "매장관리/판매",
  "주방보조/설거지",
  "주방장/조리사",
  "서빙",
  "배달",
  "사무보조",
  "청소",
  "재고/물류",
  "이사/짐",
  "돌봄",
  WORK_CATEGORY_OTHER,
] as const;

/** 목록·상세에 표시할 업종 라벨 */
export function jobWorkCategoryDisplay(meta: Record<string, unknown> | undefined | null): string {
  if (!meta || typeof meta !== "object") return "";
  const wc = String((meta as { work_category?: unknown }).work_category ?? "").trim();
  const wo = String((meta as { work_category_other?: unknown }).work_category_other ?? "").trim();
  if (wc === WORK_CATEGORY_OTHER && wo) return `${wc} · ${wo}`;
  return wc;
}

export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "none", label: "경력 무관" },
  { value: "beginner", label: "초보 가능" },
  { value: "1y", label: "1년 내외" },
  { value: "3y_plus", label: "3년 이상" },
] as const;

export const JOB_TITLE_MIN = 4;
export const JOB_TITLE_MAX = 40;
export const JOB_DESCRIPTION_MAX = 2000;
export const MIN_WAGE_2026 = 10320;
export const MIN_WAGE_PHP_HOURLY = 100;

/** 레거시 구인 유형 (당근알바 스타일) — listing_kind 없을 때 칩 보조 */
export const JOB_TYPE_OPTIONS = [
  { value: "work", label: "함께 일하실 분", badge: "업무", example: "", icon: "work" },
  { value: "help", label: "도와주실 분", badge: "이웃", example: "", icon: "help" },
  { value: "teach", label: "가르쳐 주실 분", badge: "레슨", example: "", icon: "teach" },
] as const;

export const JOB_TYPE_LABELS: Record<string, string> = {
  work: "함께 일하실 분",
  help: "도와주실 분",
  teach: "가르쳐 주실 분",
};

export const WORK_TERM_LABELS: Record<string, string> = {
  short: "단기",
  month_plus: "1개월 이상",
  fulltime: "정직원",
  long: "장기",
  one_day: "하루",
};

export const PAY_TYPE_LABELS: Record<string, string> = {
  hourly: "시급",
  daily: "일급",
  per_task: "건당",
  monthly: "월급",
};

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  none: "경력 무관",
  beginner: "초보 가능",
  "1y": "1년 내외",
  "3y_plus": "3년 이상",
};
