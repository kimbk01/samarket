"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { getLocationLabel } from "@/lib/products/form-options";
import { formatPrice } from "@/lib/utils/format";
import {
  EXPERIENCE_LEVEL_LABELS,
  JOB_LISTING_KIND_LABELS,
  PAY_TYPE_LABELS,
  WORK_TERM_LABELS,
  jobWorkCategoryDisplay,
} from "@/lib/jobs/form-options";
import { JOB_SEEKER_LANGUAGE_OPTIONS } from "@/lib/jobs/form-options";
import {
  formatJobHireTimeSlotsPipe,
  formatJobHireWeekDays,
  shouldShowJobHireWorkDates,
} from "@/lib/jobs/job-detail-format";
import { JobDetailSectionCard } from "@/components/jobs/JobDetailSectionCard";
import { TRADE_FB_DETAIL_BODY, TRADE_WRITE_FB_FIELD_HEAD } from "@/lib/ui/trade-write-fb-ui";

function formatHireLanguagesPipe(meta: Record<string, unknown>): string {
  const raw = String(meta.hire_languages ?? "").trim();
  if (!raw) return "";
  return raw
    .split("|")
    .filter(Boolean)
    .map((v) => JOB_SEEKER_LANGUAGE_OPTIONS.find((o) => o.value === v)?.label ?? v)
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
  const workCategory = jobWorkCategoryDisplay(meta);
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
      ? `${PAY_TYPE_LABELS[payType] ?? payType} ${formatPrice(payAmount, currency)}`
      : hirePayNegotiable
        ? "협의"
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
    workTimeParts.push(timeRange + (hireTimeNegotiable || workNegotiable ? " (협의 가능)" : ""));
  }
  if (hireSlotsLabel) workTimeParts.push(hireSlotsLabel);
  if (!hireSlotsLabel && availableTime) workTimeParts.push(availableTime);
  const workTimeCombined = workTimeParts.join(" · ");

  const locLine = [workAddress, geoLine].filter(Boolean).join(" · ");

  const recruitRows: { label: string; value: string }[] = [];
  recruitRows.push({ label: "글 유형", value: JOB_LISTING_KIND_LABELS.hire ?? "사람 구해요" });
  if (workCategory) recruitRows.push({ label: "업종", value: workCategory });
  if (workTerm) recruitRows.push({ label: "근무 형태", value: WORK_TERM_LABELS[workTerm] ?? workTerm });
  if (showDates) recruitRows.push({ label: "근무 날짜", value: dateRange ?? "" });
  if (hireDaysLabel) recruitRows.push({ label: "근무 요일", value: hireDaysLabel });
  if (workTimeCombined) recruitRows.push({ label: "근무 시간", value: workTimeCombined });
  if (payAmountLabel) recruitRows.push({ label: "급여", value: payAmountLabel });
  if (headcount) recruitRows.push({ label: "모집 인원", value: headcount });
  if (experienceRequired) {
    recruitRows.push({
      label: "경력",
      value: EXPERIENCE_LEVEL_LABELS[experienceRequired] ?? experienceRequired,
    });
  }
  if (locLine) recruitRows.push({ label: "근무 위치", value: locLine });

  const condRows: { label: string; value: string }[] = [];
  if (meta.hire_meal === true) condRows.push({ label: "식사 제공", value: "제공" });
  if (meta.hire_housing === true) condRows.push({ label: "숙소 제공", value: "제공" });
  const visaNote = String(meta.hire_visa_note ?? "").trim();
  if (visaNote) condRows.push({ label: "비자 안내", value: visaNote });
  const langs = formatHireLanguagesPipe(meta);
  if (langs) condRows.push({ label: "필요 언어", value: langs });
  condRows.push({ label: "당일 지급 여부", value: sameDayPay ? "예" : "아니오" });

  const content = (post.content ?? "").trim();

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title="모집 정보" rows={recruitRows} />
      <JobDetailSectionCard title="근무 조건" rows={condRows} />
      <div className="rounded-ui-rect border border-[#e4e6eb] bg-[#fafbfc] px-3 py-2.5">
        <h3 className={`${TRADE_WRITE_FB_FIELD_HEAD} mb-0`}>상세 설명</h3>
        <p className={`mt-1 ${TRADE_FB_DETAIL_BODY}`}>{content || "—"}</p>
      </div>
    </div>
  );
}
