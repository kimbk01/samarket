import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  HIRE_WEEKDAY_OPTIONS,
  JOB_SEEKER_LANGUAGE_OPTIONS,
  JOB_SEEKER_TIME_SLOT_OPTIONS,
} from "@/lib/jobs/form-options";

function optLabel(labelKey: MessageKey): string {
  return translate(DEFAULT_APP_LANGUAGE, labelKey);
}

export function formatJobHireWeekDays(meta: Record<string, unknown>): string {
  const pipe = String(meta.hire_week_days_pipe ?? "").trim();
  if (pipe) {
    return pipe
      .split("|")
      .filter(Boolean)
      .map((p) => {
        const opt = HIRE_WEEKDAY_OPTIONS.find((o) => o.value === p);
        return opt ? optLabel(opt.labelKey) : p;
      })
      .join(", ");
  }
  if (meta.hire_work_days_discuss === true) return optLabel("jobs_discuss");
  return "";
}

export function formatJobHireTimeSlotsPipe(meta: Record<string, unknown>): string {
  const raw = String(meta.hire_work_time_slots ?? "").trim();
  if (!raw) return "";
  return raw
    .split("|")
    .filter(Boolean)
    .map((v) => {
      const opt = JOB_SEEKER_TIME_SLOT_OPTIONS.find((o) => o.value === v);
      return opt ? optLabel(opt.labelKey) : v;
    })
    .join(", ");
}

export function formatSeekTimeSlotsPipe(meta: Record<string, unknown>): string {
  const raw = String(meta.seek_time_slots ?? "").trim();
  if (!raw) return "";
  return raw
    .split("|")
    .filter(Boolean)
    .map((v) => {
      const opt = JOB_SEEKER_TIME_SLOT_OPTIONS.find((o) => o.value === v);
      return opt ? optLabel(opt.labelKey) : v;
    })
    .join(", ");
}

export function formatSeekerLanguagesPipe(meta: Record<string, unknown>): string {
  const raw = String(meta.seeker_languages ?? "").trim();
  if (!raw) return "";
  return raw
    .split("|")
    .filter(Boolean)
    .map((v) => {
      const opt = JOB_SEEKER_LANGUAGE_OPTIONS.find((o) => o.value === v);
      return opt ? optLabel(opt.labelKey) : v;
    })
    .join(", ");
}

/** 근무 날짜 행 노출: 단기·알바·하루 등 (장기 전용 제외) */
export function shouldShowJobHireWorkDates(workTerm: string): boolean {
  const t = workTerm.trim().toLowerCase();
  if (!t) return true;
  if (t === "long") return false;
  return true;
}
