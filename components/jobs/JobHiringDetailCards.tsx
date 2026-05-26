"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { getLocationLabel } from "@/lib/products/form-options";
import { formatPrice } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { EXPERIENCE_LEVEL_LABELS, jobWorkCategoryDisplay } from "@/lib/jobs/form-options";
import {
  jobListingKindLabel,
  jobOptionLabel,
  jobPayTypeLabel,
  jobWorkTermLabel,
} from "@/lib/jobs/job-label-keys";
import { JOB_SEEKER_LANGUAGE_OPTIONS } from "@/lib/jobs/form-options";
import {
  formatJobHireTimeSlotsPipe,
  formatJobHireWeekDays,
  shouldShowJobHireWorkDates,
} from "@/lib/jobs/job-detail-format";
import { JobDetailSectionCard } from "@/components/jobs/JobDetailSectionCard";
import { TRADE_FB_DETAIL_BODY, TRADE_WRITE_FB_FIELD_HEAD } from "@/lib/ui/trade-write-fb-ui";

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

export function JobHiringDetailCards({
  post,
  meta,
  currency,
}: {
  post: PostWithMeta;
  meta: Record<string, unknown>;
  currency: string;
}) {
  const { t, language } = useI18n();
  const workCategory = jobWorkCategoryDisplay(meta, language);
  const workTerm = String(meta.work_term ?? "").trim();
  const workDateStart = String(meta.work_date_start ?? "").trim();
  const workDateEnd = String(meta.work_date_end ?? "").trim();
  const workTimeStart = String(meta.work_time_start ?? "").trim();
  const workTimeEnd = String(meta.work_time_end ?? "").trim();
  const hireTimeNegotiable = meta.hire_time_negotiable === true;
  const workNegotiable = meta.work_negotiable === true;
  const payType = String(meta.pay_type ?? "").trim();
  const payAmount = meta.pay_amount != null ? Number(meta.pay_amount) : post.price ?? null;
  const hirePayNegotiable = meta.hire_pay_negotiable === true || payType === "negotiate";
  const sameDayPay = meta.same_day_pay === true;
  const workAddress = String(meta.work_address ?? "").trim();
  const headcountRaw = meta.hire_headcount != null ? String(meta.hire_headcount).trim() : "";
  const headcount =
    headcountRaw ||
    (post.headcount != null && Number.isFinite(Number(post.headcount)) ? String(post.headcount) : "");
  const experienceRequired =
    post.experience_required != null ? String(post.experience_required).trim() : "";
  const availableTime = String(meta.available_time ?? "").trim();

  const payAmountLabel =
    payAmount != null && !Number.isNaN(payAmount)
      ? `${jobPayTypeLabel(t, payType)} ${formatPrice(payAmount, currency)}`
      : hirePayNegotiable
        ? t("jobs_pay_negotiate")
        : "";

  const dateRange =
    workDateStart && workDateEnd
      ? `${workDateStart} ~ ${workDateEnd}`
      : workDateStart
        ? workDateStart
        : null;
  const timeRange =
    workTimeStart && workTimeEnd ? `${workTimeStart} ~ ${workTimeEnd}` : workTimeStart ? workTimeStart : null;

  const regionId = post.region?.trim() ?? "";
  const cityId = post.city?.trim() ?? "";
  const geoLine = regionId && cityId ? getLocationLabel(regionId, cityId) : "";

  const hireSlotsLabel = formatJobHireTimeSlotsPipe(meta);
  const hireDaysLabel = formatJobHireWeekDays(meta);

  const showDates = shouldShowJobHireWorkDates(workTerm) && dateRange;

  const workTimeParts: string[] = [];
  if (timeRange) {
    workTimeParts.push(
      timeRange + (hireTimeNegotiable || workNegotiable ? t("ui_jobs_time_negotiable_suffix") : "")
    );
  }
  if (hireSlotsLabel) workTimeParts.push(hireSlotsLabel);
  if (!hireSlotsLabel && availableTime) workTimeParts.push(availableTime);
  const workTimeCombined = workTimeParts.join(" · ");

  const locLine = [workAddress, geoLine].filter(Boolean).join(" · ");

  const recruitRows: { label: string; value: string }[] = [];
  recruitRows.push({ label: t("ui_jobs_row_listing_kind"), value: jobListingKindLabel(t, "hire") });
  if (workCategory) recruitRows.push({ label: t("ui_jobs_row_industry"), value: workCategory });
  if (workTerm) recruitRows.push({ label: t("ui_jobs_row_work_term"), value: jobWorkTermLabel(t, workTerm) });
  if (showDates) recruitRows.push({ label: t("ui_jobs_row_work_dates"), value: dateRange ?? "" });
  if (hireDaysLabel) recruitRows.push({ label: t("ui_jobs_row_work_days"), value: hireDaysLabel });
  if (workTimeCombined) recruitRows.push({ label: t("ui_jobs_row_work_hours"), value: workTimeCombined });
  if (payAmountLabel) recruitRows.push({ label: t("ui_jobs_row_pay"), value: payAmountLabel });
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

  const condRows: { label: string; value: string }[] = [];
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

  const content = (post.content ?? "").trim();

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title={t("ui_jobs_detail_recruit_section")} rows={recruitRows} />
      <JobDetailSectionCard title={t("ui_jobs_detail_conditions_section")} rows={condRows} />
      <div className="rounded-ui-rect border border-[#e4e6eb] bg-[#fafbfc] px-3 py-2.5">
        <h3 className={`${TRADE_WRITE_FB_FIELD_HEAD} mb-0`}>{t("ui_jobs_detail_description_heading")}</h3>
        <p className={`mt-1 ${TRADE_FB_DETAIL_BODY}`}>{content || "—"}</p>
      </div>
    </div>
  );
}
