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
  hire: "사람 구해요",
  work: "일자리 찾고 있어요",
};

/** 근무 형태: 단기 / 장기 / 하루 (meta.work_term) */
export const JOB_WORK_TYPE_OPTIONS = [
  { value: "short", label: "단기" },
  { value: "long", label: "장기" },
  { value: "one_day", label: "하루" },
] as const;

/** 급여 형태 — 시급/일급/월급/건당 (구인 `JobsWriteForm`) */
export const PAY_TYPE_OPTIONS = [
  { value: "hourly", label: "시급" },
  { value: "daily", label: "일급" },
  { value: "monthly", label: "월급" },
  { value: "per_task", label: "건당" },
] as const;

/** 구인 근무 요일 — DB `posts.work_days` 토큰 */
export const HIRE_WEEKDAY_OPTIONS = [
  { value: "mon", label: "월" },
  { value: "tue", label: "화" },
  { value: "wed", label: "수" },
  { value: "thu", label: "목" },
  { value: "fri", label: "금" },
  { value: "sat", label: "토" },
  { value: "sun", label: "일" },
] as const;

/** 구인 모집 성별 선호 — meta.hire_gender */
export const HIRE_GENDER_OPTIONS = [
  { value: "any", label: "무관" },
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "discuss", label: "협의" },
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
  short_alba: "단기/알바",
  parttime: "파트타임",
  remote: "재택",
  discuss: "협의",
};

export const PAY_TYPE_LABELS: Record<string, string> = {
  hourly: "시급",
  daily: "일급",
  per_task: "건당",
  monthly: "월급",
  negotiate: "협의",
};

/**
 * 구직(일 찾고 있어요) — 희망 업종 (구인 `WORK_CATEGORY_OPTIONS` 와 별도)
 * `기타` 선택 시 `work_category_other`에 상세
 */
export const JOB_SEEKER_INDUSTRY_OPTIONS = [
  "식당/주방",
  "서빙/카페",
  "매장관리/판매",
  "사무/통역",
  "운전/배송",
  "청소/가사",
  "마사지/스파",
  "건설/현장",
  "온라인/재택",
  WORK_CATEGORY_OTHER,
] as const;

/** 구직 희망 업종 정규화 — 드롭다운 외 값은 기타+본문으로 합침 */
export function normalizeJobSeekerIndustrySelect(wc: string, wo: string): { category: string; other: string } {
  const t = wc.trim();
  const o = wo.trim();
  const opts = JOB_SEEKER_INDUSTRY_OPTIONS as readonly string[];
  if (!t) return { category: "", other: o };
  if (opts.includes(t)) {
    return { category: t, other: t === WORK_CATEGORY_OTHER ? o : "" };
  }
  return { category: WORK_CATEGORY_OTHER, other: o || t };
}

/** 구직 희망 근무형태 — `job_employment_type` / meta.work_term */
export const JOB_SEEKER_WORK_STYLE_OPTIONS = [
  { value: "long", label: "장기" },
  { value: "short_alba", label: "단기/알바" },
  { value: "parttime", label: "파트타임" },
  { value: "remote", label: "재택" },
  { value: "discuss", label: "협의" },
] as const;

/** 구직 근무 가능 시간(멀티) — meta.seek_time_slots 로 `|` 직렬화 */
export const JOB_SEEKER_TIME_SLOT_OPTIONS = [
  { value: "morning", label: "오전" },
  { value: "afternoon", label: "오후" },
  { value: "evening", label: "저녁" },
  { value: "fulltime", label: "풀타임" },
  { value: "weekend", label: "주말 가능" },
  { value: "time_discuss", label: "시간 협의" },
] as const;

/** 구직 희망 급여 — 시급/일급/월급/협의 (구인 `PAY_TYPE_OPTIONS` 와 분리) */
export const JOB_SEEKER_PAY_TYPE_OPTIONS = [
  { value: "hourly", label: "시급" },
  { value: "daily", label: "일급" },
  { value: "monthly", label: "월급" },
  { value: "negotiate", label: "협의" },
] as const;

/** 구직 가능 언어 (멀티) — meta.seeker_languages */
export const JOB_SEEKER_LANGUAGE_OPTIONS = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "영어" },
  { value: "tl", label: "타갈로그" },
  { value: "other", label: "기타" },
] as const;

export type JobSeekerVisaValue = "ok" | "check" | "private";
export type JobSeekerStartValue = "yes" | "date" | "discuss";

export const JOB_SEEKER_VISA_OPTIONS: { value: JobSeekerVisaValue; label: string }[] = [
  { value: "ok", label: "가능" },
  { value: "check", label: "확인 필요" },
  { value: "private", label: "비공개" },
];

export const JOB_SEEKER_START_OPTIONS: { value: JobSeekerStartValue; label: string }[] = [
  { value: "yes", label: "가능" },
  { value: "date", label: "날짜 선택" },
  { value: "discuss", label: "협의" },
];

export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = {
  none: "경력 무관",
  beginner: "초보 가능",
  "1y": "1년 내외",
  "3y_plus": "3년 이상",
};
