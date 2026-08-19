"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { getLocationLabel } from "@/lib/products/form-options";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  EXPERIENCE_LEVEL_LABELS,
  JOB_SEEKER_START_OPTIONS,
  JOB_SEEKER_VISA_OPTIONS,
  JOB_SEEKER_LANGUAGE_OPTIONS,
  type JobSeekerStartValue,
} from "@/lib/jobs/form-options";
import { jobOptionLabel } from "@/lib/jobs/job-label-keys";
import {
  formatJobHireTimeSlotsPipe,
  formatJobHireWeekDays,
  formatSeekTimeSlotsPipe,
  formatSeekerLanguagesPipe,
} from "@/lib/jobs/job-detail-format";
import { JobDetailSectionCard } from "@/components/jobs/JobDetailSectionCard";

type JobExtraRow = { label: string; value: string };

function formatHireLanguagesPipe(
  t: ReturnType<typeof useI18n>["t"],
  meta: Record<string, unknown>
): string {
  const raw = String(meta.hire_languages ?? "").trim();
  if (!raw) return "";
  return raw
    .split("|")
    .filter(Boolean)
    .map((v) => {
      const opt = JOB_SEEKER_LANGUAGE_OPTIONS.find((o) => o.value === v);
      return opt ? jobOptionLabel(t, opt.labelKey) : v;
    })
    .join(", ");
}

function tradeMeetDisplayLine(meta: Record<string, unknown>): string {
  const spot = meta.trade_meet_spot;
  if (spot && typeof spot === "object" && !Array.isArray(spot)) {
    const line = String((spot as { display_line?: unknown }).display_line ?? "").trim();
    if (line) return line;
  }
  return "";
}

function seekerStartLabel(t: ReturnType<typeof useI18n>["t"], meta: Record<string, unknown>): string {
  const raw = String(meta.seeker_start ?? "").trim() as JobSeekerStartValue | "";
  const opt = JOB_SEEKER_START_OPTIONS.find((o) => o.value === raw);
  const base = opt ? jobOptionLabel(t, opt.labelKey) : raw ? raw : "";
  const d = String(meta.seeker_start_date ?? "").trim();
  if (raw === "date" && d) return `${base}: ${d}`;
  return base || "";
}

function locationLine(post: PostWithMeta, meta: Record<string, unknown>): { geoLine: string; meetLine: string } {
  const regionId = post.region?.trim() ?? "";
  const cityId = post.city?.trim() ?? "";
  const geoLine = regionId && cityId ? getLocationLabel(regionId, cityId) : "";
  return { geoLine, meetLine: tradeMeetDisplayLine(meta) };
}

function HiringExtras({ post, meta }: { post: PostWithMeta; meta: Record<string, unknown> }) {
  const { t } = useI18n();
  const workTimeStart = String(meta.work_time_start ?? "").trim();
  const workTimeEnd = String(meta.work_time_end ?? "").trim();
  const hireTimeNegotiable = meta.hire_time_negotiable === true;
  const workNegotiable = meta.work_negotiable === true;
  const sameDayPay = meta.same_day_pay === true;
  const workAddress = String(meta.work_address ?? "").trim();
  const headcountRaw = meta.hire_headcount != null ? String(meta.hire_headcount).trim() : "";
  const headcount =
    headcountRaw ||
    (post.headcount != null && Number.isFinite(Number(post.headcount)) ? String(post.headcount) : "");
  const experienceRequired =
    post.experience_required != null ? String(post.experience_required).trim() : "";
  const availableTime = String(meta.available_time ?? "").trim();
  const timeRange =
    workTimeStart && workTimeEnd ? `${workTimeStart} ~ ${workTimeEnd}` : workTimeStart ? workTimeStart : null;
  const hireSlotsLabel = formatJobHireTimeSlotsPipe(meta);
  const hireDaysLabel = formatJobHireWeekDays(meta);
  const { geoLine } = locationLine(post, meta);
  const locLine = [workAddress, geoLine].filter(Boolean).join(" · ");

  const workTimeParts: string[] = [];
  if (timeRange) {
    workTimeParts.push(
      timeRange + (hireTimeNegotiable || workNegotiable ? t("ui_jobs_time_negotiable_suffix") : "")
    );
  }
  if (hireSlotsLabel) workTimeParts.push(hireSlotsLabel);
  if (!hireSlotsLabel && availableTime) workTimeParts.push(availableTime);
  const workTimeCombined = workTimeParts.join(" · ");

  const recruitRows: JobExtraRow[] = [];
  if (hireDaysLabel) recruitRows.push({ label: t("ui_jobs_row_work_days"), value: hireDaysLabel });
  if (workTimeCombined) recruitRows.push({ label: t("ui_jobs_row_work_hours"), value: workTimeCombined });
  if (headcount) recruitRows.push({ label: t("ui_jobs_row_headcount"), value: headcount });
  if (experienceRequired) {
    recruitRows.push({
      label: t("ui_jobs_row_experience"),
      value: EXPERIENCE_LEVEL_LABELS[experienceRequired]
        ? t(EXPERIENCE_LEVEL_LABELS[experienceRequired])
        : experienceRequired,
    });
  }
  if (locLine) recruitRows.push({ label: t("ui_jobs_row_location"), value: locLine });

  const condRows: JobExtraRow[] = [];
  if (meta.hire_meal === true) {
    condRows.push({ label: t("ui_jobs_row_meal"), value: t("ui_jobs_value_provided") });
  }
  if (meta.hire_housing === true) {
    condRows.push({ label: t("ui_jobs_row_housing"), value: t("ui_jobs_value_provided") });
  }
  const visaNote = String(meta.hire_visa_note ?? "").trim();
  if (visaNote) condRows.push({ label: t("ui_jobs_row_visa_note"), value: visaNote });
  const langs = formatHireLanguagesPipe(t, meta);
  if (langs) condRows.push({ label: t("ui_jobs_row_languages_required"), value: langs });
  condRows.push({
    label: t("ui_jobs_row_same_day_pay"),
    value: sameDayPay ? t("ui_jobs_value_yes") : t("ui_jobs_value_no"),
  });

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title={t("ui_jobs_detail_conditions_section")} rows={recruitRows} />
      <JobDetailSectionCard title={t("ui_jobs_detail_extra_section")} rows={condRows} />
    </div>
  );
}

function SeekingExtras({ post, meta }: { post: PostWithMeta; meta: Record<string, unknown> }) {
  const { t } = useI18n();
  const slotsLine = formatSeekTimeSlotsPipe(meta);
  const { geoLine, meetLine } = locationLine(post, meta);
  const hopeWorkRegion = geoLine || meetLine || "";
  const visaRaw = String(meta.seeker_visa ?? "").trim();
  const visaOpt = JOB_SEEKER_VISA_OPTIONS.find((o) => o.value === visaRaw);
  const visaLabel = visaOpt ? jobOptionLabel(t, visaOpt.labelKey) : visaRaw || "";
  const langLine = formatSeekerLanguagesPipe(meta);
  const startLine = seekerStartLabel(t, meta);

  const extraRows: JobExtraRow[] = [];
  if (slotsLine) extraRows.push({ label: t("ui_jobs_row_available_time"), value: slotsLine });
  if (hopeWorkRegion) extraRows.push({ label: t("ui_jobs_row_hope_region"), value: hopeWorkRegion });
  if (langLine) extraRows.push({ label: t("ui_jobs_row_languages_available"), value: langLine });
  if (visaLabel) extraRows.push({ label: t("ui_jobs_row_visa_status"), value: visaLabel });
  if (startLine) extraRows.push({ label: t("ui_jobs_row_start_availability"), value: startLine });
  if (geoLine && meetLine && meetLine !== geoLine) {
    extraRows.push({ label: t("ui_jobs_row_mobility_region"), value: meetLine });
  }

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title={t("ui_jobs_detail_extra_section")} rows={extraRows} />
    </div>
  );
}

export function JobsExtendedDetailExtras({
  variant,
  post,
  meta,
}: {
  variant: "hire" | "work";
  post: PostWithMeta;
  meta: Record<string, unknown>;
}) {
  return variant === "hire" ? <HiringExtras post={post} meta={meta} /> : <SeekingExtras post={post} meta={meta} />;
}
