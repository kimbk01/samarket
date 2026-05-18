import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const defaultT: T = (key, vars) => translate(DEFAULT_APP_LANGUAGE, key, vars);

const PAY_KEYS: Record<string, MessageKey> = {
  hourly: "jobs_pay_hourly",
  daily: "jobs_pay_daily",
  monthly: "jobs_pay_monthly",
  per_task: "jobs_pay_per_task",
  negotiate: "jobs_pay_negotiate",
};

const TERM_KEYS: Record<string, MessageKey> = {
  short: "jobs_term_short",
  long: "jobs_term_long",
  one_day: "jobs_term_one_day",
  month_plus: "jobs_term_month_plus",
  fulltime: "jobs_term_fulltime",
  short_alba: "jobs_term_short_alba",
  parttime: "jobs_term_parttime",
  remote: "jobs_term_remote",
  discuss: "jobs_term_discuss",
};

const LISTING_KEYS: Record<string, MessageKey> = {
  hire: "jobs_listing_hire",
  work: "jobs_listing_work",
};

const EXP_KEYS: Record<string, MessageKey> = {
  none: "jobs_exp_none",
  beginner: "jobs_exp_beginner",
  "1y": "jobs_exp_1y",
  "3y_plus": "jobs_exp_3y_plus",
};

const TYPE_KEYS: Record<string, MessageKey> = {
  work: "jobs_type_work",
  help: "jobs_type_help",
  teach: "jobs_type_teach",
};

export function jobListingKindLabel(t: T, kind: string): string {
  const key = LISTING_KEYS[kind];
  return key ? t(key) : kind;
}

export function jobPayTypeLabel(t: T, payType: string): string {
  const key = PAY_KEYS[payType];
  return key ? t(key) : payType;
}

export function jobWorkTermLabel(t: T, term: string): string {
  const key = TERM_KEYS[term];
  return key ? t(key) : term;
}

export function jobExperienceLabel(t: T, level: string): string {
  const key = EXP_KEYS[level];
  return key ? t(key) : level;
}

export function jobLegacyTypeLabel(t: T, type: string): string {
  const key = TYPE_KEYS[type];
  return key ? t(key) : type;
}

export function jobOptionLabel(t: T, labelKey: MessageKey): string {
  return t(labelKey);
}

export function jobListingKindLabelDefault(kind: string): string {
  return jobListingKindLabel(defaultT, kind);
}

export function jobPayTypeLabelDefault(payType: string): string {
  return jobPayTypeLabel(defaultT, payType);
}

export function jobWorkTermLabelDefault(term: string): string {
  return jobWorkTermLabel(defaultT, term);
}
