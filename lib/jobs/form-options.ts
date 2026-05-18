/**
 * 일자리(당근 스타일) — 구인(hire) / 구직(work) · 메타 키와 UI 옵션
 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 글 성격: 구인 vs 구직 (meta.listing_kind) */
export const JOB_LISTING_KIND_OPTIONS = [
  { value: "hire" as const, labelKey: "jobs_listing_hire" as MessageKey },
  { value: "work" as const, labelKey: "jobs_listing_work_short" as MessageKey },
] as const;

export type JobListingKind = (typeof JOB_LISTING_KIND_OPTIONS)[number]["value"];

/** @deprecated use `jobListingKindLabel(t, kind)` */
export const JOB_LISTING_KIND_LABELS: Record<string, MessageKey> = {
  hire: "jobs_listing_hire",
  work: "jobs_listing_work",
};

/** 근무 형태: 단기 / 장기 / 하루 (meta.work_term) */
export const JOB_WORK_TYPE_OPTIONS = [
  { value: "short", labelKey: "jobs_term_short" as MessageKey },
  { value: "long", labelKey: "jobs_term_long" as MessageKey },
  { value: "one_day", labelKey: "jobs_term_one_day" as MessageKey },
] as const;

/** 급여 형태 — 시급/일급/월급/건당 (구인 `JobsWriteForm`) */
export const PAY_TYPE_OPTIONS = [
  { value: "hourly", labelKey: "jobs_pay_hourly" as MessageKey },
  { value: "daily", labelKey: "jobs_pay_daily" as MessageKey },
  { value: "monthly", labelKey: "jobs_pay_monthly" as MessageKey },
  { value: "per_task", labelKey: "jobs_pay_per_task" as MessageKey },
] as const;

/** 구인 근무 요일 — DB `posts.work_days` 토큰 */
export const HIRE_WEEKDAY_OPTIONS = [
  { value: "mon", labelKey: "jobs_weekday_mon" as MessageKey },
  { value: "tue", labelKey: "jobs_weekday_tue" as MessageKey },
  { value: "wed", labelKey: "jobs_weekday_wed" as MessageKey },
  { value: "thu", labelKey: "jobs_weekday_thu" as MessageKey },
  { value: "fri", labelKey: "jobs_weekday_fri" as MessageKey },
  { value: "sat", labelKey: "jobs_weekday_sat" as MessageKey },
  { value: "sun", labelKey: "jobs_weekday_sun" as MessageKey },
] as const;

/** 구인 모집 성별 선호 — meta.hire_gender */
export const HIRE_GENDER_OPTIONS = [
  { value: "any", labelKey: "jobs_gender_any" as MessageKey },
  { value: "male", labelKey: "jobs_gender_male" as MessageKey },
  { value: "female", labelKey: "jobs_gender_female" as MessageKey },
  { value: "discuss", labelKey: "jobs_gender_discuss" as MessageKey },
] as const;

/** 업종 칩 — `WORK_CATEGORY_OTHER` 선택 시 `work_category_other` 메타에 상세 입력 */
export const WORK_CATEGORY_OTHER = "기타";
export const WORK_CATEGORY_OTHER_MAX = 40;

type JobDbLabelOption = { value: string; labelKey: MessageKey };

/** DB `work_category` 저장값(한글) — UI 표시는 `jobWorkCategoryDbLabel(t, value)` */
export const WORK_CATEGORY_OPTIONS: readonly JobDbLabelOption[] = [
  { value: "매장관리/판매", labelKey: "jobs_wc_retail" },
  { value: "주방보조/설거지", labelKey: "jobs_wc_kitchen_help" },
  { value: "주방장/조리사", labelKey: "jobs_wc_cook" },
  { value: "서빙", labelKey: "jobs_wc_serving" },
  { value: "배달", labelKey: "jobs_wc_delivery" },
  { value: "사무보조", labelKey: "jobs_wc_office" },
  { value: "청소", labelKey: "jobs_wc_cleaning" },
  { value: "재고/물류", labelKey: "jobs_wc_logistics" },
  { value: "이사/짐", labelKey: "jobs_wc_moving" },
  { value: "돌봄", labelKey: "jobs_wc_care" },
  { value: WORK_CATEGORY_OTHER, labelKey: "jobs_cat_other" },
] as const;

export const WORK_CATEGORY_DB_VALUES: readonly string[] = WORK_CATEGORY_OPTIONS.map((o) => o.value);

const WORK_CATEGORY_VALUE_TO_KEY = Object.fromEntries(
  WORK_CATEGORY_OPTIONS.map((o) => [o.value, o.labelKey])
) as Record<string, MessageKey>;

export function jobWorkCategoryDbLabel(lang: AppLanguageCode, dbValue: string): string {
  const v = dbValue.trim();
  if (!v) return "";
  const key = WORK_CATEGORY_VALUE_TO_KEY[v];
  return key ? translate(lang, key) : v;
}

/** 목록·상세에 표시할 업종 라벨 */
export function jobWorkCategoryDisplay(
  meta: Record<string, unknown> | undefined | null,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  if (!meta || typeof meta !== "object") return "";
  const wc = String((meta as { work_category?: unknown }).work_category ?? "").trim();
  const wo = String((meta as { work_category_other?: unknown }).work_category_other ?? "").trim();
  const wcLabel = jobWorkCategoryDbLabel(lang, wc);
  if (wc === WORK_CATEGORY_OTHER && wo) return `${wcLabel} · ${wo}`;
  return wcLabel;
}

export const EXPERIENCE_LEVEL_OPTIONS = [
  { value: "none", labelKey: "jobs_exp_none" as MessageKey },
  { value: "beginner", labelKey: "jobs_exp_beginner" as MessageKey },
  { value: "1y", labelKey: "jobs_exp_1y" as MessageKey },
  { value: "3y_plus", labelKey: "jobs_exp_3y_plus" as MessageKey },
] as const;

export const JOB_TITLE_MIN = 4;
export const JOB_TITLE_MAX = 40;
export const JOB_DESCRIPTION_MAX = 2000;
export const MIN_WAGE_2026 = 10320;
export const MIN_WAGE_PHP_HOURLY = 100;

/** 레거시 구인 유형 (당근알바 스타일) — listing_kind 없을 때 칩 보조 */
export const JOB_TYPE_OPTIONS = [
  { value: "work", labelKey: "jobs_type_work" as MessageKey, badgeKey: "jobs_badge_work" as MessageKey, example: "", icon: "work" },
  { value: "help", labelKey: "jobs_type_help" as MessageKey, badgeKey: "jobs_badge_help" as MessageKey, example: "", icon: "help" },
  { value: "teach", labelKey: "jobs_type_teach" as MessageKey, badgeKey: "jobs_badge_teach" as MessageKey, example: "", icon: "teach" },
] as const;

/** @deprecated use `jobWorkTermLabel` / `jobPayTypeLabel` */
export const WORK_TERM_LABELS: Record<string, MessageKey> = {
  short: "jobs_term_short",
  month_plus: "jobs_term_month_plus",
  fulltime: "jobs_term_fulltime",
  long: "jobs_term_long",
  one_day: "jobs_term_one_day",
  short_alba: "jobs_term_short_alba",
  parttime: "jobs_term_parttime",
  remote: "jobs_term_remote",
  discuss: "jobs_term_discuss",
};

/** @deprecated use `jobPayTypeLabel` */
export const PAY_TYPE_LABELS: Record<string, MessageKey> = {
  hourly: "jobs_pay_hourly",
  daily: "jobs_pay_daily",
  per_task: "jobs_pay_per_task",
  monthly: "jobs_pay_monthly",
  negotiate: "jobs_pay_negotiate",
};

/**
 * 구직(일 찾고 있어요) — 희망 업종 (구인 `WORK_CATEGORY_OPTIONS` 와 별도)
 * `기타` 선택 시 `work_category_other`에 상세
 */
export const JOB_SEEKER_INDUSTRY_OPTIONS: readonly JobDbLabelOption[] = [
  { value: "식당/주방", labelKey: "jobs_seek_ind_restaurant" },
  { value: "서빙/카페", labelKey: "jobs_seek_ind_cafe" },
  { value: "매장관리/판매", labelKey: "jobs_seek_ind_retail" },
  { value: "사무/통역", labelKey: "jobs_seek_ind_office" },
  { value: "운전/배송", labelKey: "jobs_seek_ind_driver" },
  { value: "청소/가사", labelKey: "jobs_seek_ind_cleaning" },
  { value: "마사지/스파", labelKey: "jobs_seek_ind_spa" },
  { value: "건설/현장", labelKey: "jobs_seek_ind_construction" },
  { value: "온라인/재택", labelKey: "jobs_seek_ind_remote" },
  { value: WORK_CATEGORY_OTHER, labelKey: "jobs_cat_other" },
] as const;

export const JOB_SEEKER_INDUSTRY_DB_VALUES: readonly string[] = JOB_SEEKER_INDUSTRY_OPTIONS.map(
  (o) => o.value
);

const JOB_SEEKER_INDUSTRY_VALUE_TO_KEY = Object.fromEntries(
  JOB_SEEKER_INDUSTRY_OPTIONS.map((o) => [o.value, o.labelKey])
) as Record<string, MessageKey>;

export function jobSeekerIndustryDbLabel(lang: AppLanguageCode, dbValue: string): string {
  const v = dbValue.trim();
  if (!v) return "";
  const key = JOB_SEEKER_INDUSTRY_VALUE_TO_KEY[v];
  return key ? translate(lang, key) : v;
}

/** 구직 희망 업종 정규화 — 드롭다운 외 값은 기타+본문으로 합침 */
export function normalizeJobSeekerIndustrySelect(wc: string, wo: string): { category: string; other: string } {
  const t = wc.trim();
  const o = wo.trim();
  const opts = JOB_SEEKER_INDUSTRY_DB_VALUES;
  if (!t) return { category: "", other: o };
  if (opts.includes(t)) {
    return { category: t, other: t === WORK_CATEGORY_OTHER ? o : "" };
  }
  return { category: WORK_CATEGORY_OTHER, other: o || t };
}

/** 구직 희망 근무형태 — `job_employment_type` / meta.work_term */
export const JOB_SEEKER_WORK_STYLE_OPTIONS = [
  { value: "long", labelKey: "jobs_term_long" as MessageKey },
  { value: "short_alba", labelKey: "jobs_term_short_alba" as MessageKey },
  { value: "parttime", labelKey: "jobs_term_parttime" as MessageKey },
  { value: "remote", labelKey: "jobs_term_remote" as MessageKey },
  { value: "discuss", labelKey: "jobs_term_discuss" as MessageKey },
] as const;

/** 구직 근무 가능 시간(멀티) — meta.seek_time_slots 로 `|` 직렬화 */
export const JOB_SEEKER_TIME_SLOT_OPTIONS = [
  { value: "morning", labelKey: "jobs_seek_morning" as MessageKey },
  { value: "afternoon", labelKey: "jobs_seek_afternoon" as MessageKey },
  { value: "evening", labelKey: "jobs_seek_evening" as MessageKey },
  { value: "fulltime", labelKey: "jobs_seek_fulltime" as MessageKey },
  { value: "weekend", labelKey: "jobs_seek_weekend" as MessageKey },
  { value: "time_discuss", labelKey: "jobs_seek_time_discuss" as MessageKey },
] as const;

/** 구직 희망 급여 — 시급/일급/월급/협의 (구인 `PAY_TYPE_OPTIONS` 와 분리) */
export const JOB_SEEKER_PAY_TYPE_OPTIONS = [
  { value: "hourly", labelKey: "jobs_pay_hourly" as MessageKey },
  { value: "daily", labelKey: "jobs_pay_daily" as MessageKey },
  { value: "monthly", labelKey: "jobs_pay_monthly" as MessageKey },
  { value: "negotiate", labelKey: "jobs_pay_negotiate" as MessageKey },
] as const;

/** 구직 가능 언어 (멀티) — meta.seeker_languages */
export const JOB_SEEKER_LANGUAGE_OPTIONS = [
  { value: "ko", labelKey: "jobs_lang_ko" as MessageKey },
  { value: "en", labelKey: "jobs_lang_en" as MessageKey },
  { value: "tl", labelKey: "jobs_lang_tl" as MessageKey },
  { value: "other", labelKey: "jobs_lang_other" as MessageKey },
] as const;

export type JobSeekerVisaValue = "ok" | "check" | "private";
export type JobSeekerStartValue = "yes" | "date" | "discuss";

export const JOB_SEEKER_VISA_OPTIONS: { value: JobSeekerVisaValue; labelKey: MessageKey }[] = [
  { value: "ok", labelKey: "jobs_visa_ok" },
  { value: "check", labelKey: "jobs_visa_check" },
  { value: "private", labelKey: "jobs_visa_private" },
];

export const JOB_SEEKER_START_OPTIONS: { value: JobSeekerStartValue; labelKey: MessageKey }[] = [
  { value: "yes", labelKey: "jobs_start_yes" },
  { value: "date", labelKey: "jobs_start_date" },
  { value: "discuss", labelKey: "jobs_start_discuss" },
];

/** @deprecated use `jobExperienceLabel` */
export const EXPERIENCE_LEVEL_LABELS: Record<string, MessageKey> = {
  none: "jobs_exp_none",
  beginner: "jobs_exp_beginner",
  "1y": "jobs_exp_1y",
  "3y_plus": "jobs_exp_3y_plus",
};

/** @deprecated use `jobLegacyTypeLabel` */
export const JOB_TYPE_LABELS: Record<string, MessageKey> = {
  work: "jobs_type_work",
  help: "jobs_type_help",
  teach: "jobs_type_teach",
};
