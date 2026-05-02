"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { getLocationLabel } from "@/lib/products/form-options";
import { formatPrice } from "@/lib/utils/format";
import {
  EXPERIENCE_LEVEL_LABELS,
  JOB_LISTING_KIND_LABELS,
  JOB_SEEKER_START_OPTIONS,
  JOB_SEEKER_VISA_OPTIONS,
  PAY_TYPE_LABELS,
  WORK_TERM_LABELS,
  jobWorkCategoryDisplay,
  type JobSeekerStartValue,
} from "@/lib/jobs/form-options";
import { formatSeekTimeSlotsPipe, formatSeekerLanguagesPipe } from "@/lib/jobs/job-detail-format";
import { JobDetailSectionCard } from "@/components/jobs/JobDetailSectionCard";
import { TRADE_FB_DETAIL_BODY, TRADE_WRITE_FB_FIELD_HEAD } from "@/lib/ui/trade-write-fb-ui";

function tradeMeetDisplayLine(meta: Record<string, unknown>): string {
  const spot = meta.trade_meet_spot;
  if (spot && typeof spot === "object" && !Array.isArray(spot)) {
    const line = String((spot as { display_line?: unknown }).display_line ?? "").trim();
    if (line) return line;
  }
  return "";
}

function seekerStartLabel(meta: Record<string, unknown>): string {
  const raw = String(meta.seeker_start ?? "").trim() as JobSeekerStartValue | "";
  const opt = JOB_SEEKER_START_OPTIONS.find((o) => o.value === raw);
  const base = opt?.label ?? (raw ? raw : "");
  const d = String(meta.seeker_start_date ?? "").trim();
  if (raw === "date" && d) return `${base}: ${d}`;
  return base || "";
}

export function JobSeekingDetailCards({
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
  const experienceLevel = String(meta.experience_level ?? "").trim();
  const payType = String(meta.pay_type ?? "").trim();
  const payAmount = meta.pay_amount != null ? Number(meta.pay_amount) : post.price ?? null;
  const availableTime = String(meta.available_time ?? "").trim();
  const slotsLine = formatSeekTimeSlotsPipe(meta);
  const timeLine = [slotsLine, availableTime].filter(Boolean).join(", ");

  const regionId = post.region?.trim() ?? "";
  const cityId = post.city?.trim() ?? "";
  const geoLine = regionId && cityId ? getLocationLabel(regionId, cityId) : "";
  const meetLine = tradeMeetDisplayLine(meta);
  const hopeWorkRegion = geoLine || meetLine || "";

  const payLabel =
    payAmount != null && !Number.isNaN(payAmount)
      ? `${PAY_TYPE_LABELS[payType] ?? payType} ${formatPrice(payAmount, currency)}`
      : payType === "negotiate"
        ? "협의"
        : "";

  const seekRows: { label: string; value: string }[] = [];
  seekRows.push({ label: "글 유형", value: JOB_LISTING_KIND_LABELS.work ?? "일자리 찾고 있어요" });
  if (workCategory) seekRows.push({ label: "희망 업종", value: workCategory });
  if (workTerm) seekRows.push({ label: "희망 근무형태", value: WORK_TERM_LABELS[workTerm] ?? workTerm });

  if (timeLine) seekRows.push({ label: "가능 시간", value: timeLine });
  if (payLabel) seekRows.push({ label: "희망 급여", value: payLabel });
  if (experienceLevel) {
    seekRows.push({
      label: "경력",
      value: EXPERIENCE_LEVEL_LABELS[experienceLevel] ?? experienceLevel,
    });
  }
  if (hopeWorkRegion) seekRows.push({ label: "희망 근무지역", value: hopeWorkRegion });

  const visaRaw = String(meta.seeker_visa ?? "").trim();
  const visaLabel = JOB_SEEKER_VISA_OPTIONS.find((o) => o.value === visaRaw)?.label ?? (visaRaw || "");

  const langLine = formatSeekerLanguagesPipe(meta);
  const startLine = seekerStartLabel(meta);

  const extraRows: { label: string; value: string }[] = [];
  if (langLine) extraRows.push({ label: "가능 언어", value: langLine });
  if (visaLabel) extraRows.push({ label: "비자 상태", value: visaLabel });
  if (startLine) extraRows.push({ label: "즉시 근무 가능 여부", value: startLine });

  if (geoLine && meetLine && meetLine !== geoLine) {
    extraRows.push({ label: "이동 가능 지역", value: meetLine });
  }

  const content = (post.content ?? "").trim();

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title="구직 정보" rows={seekRows} />
      <div className="rounded-ui-rect border border-[#e4e6eb] bg-[#fafbfc] px-3 py-2.5">
        <h3 className={`${TRADE_WRITE_FB_FIELD_HEAD} mb-0`}>자기소개</h3>
        <p className={`mt-1 ${TRADE_FB_DETAIL_BODY}`}>{content || "—"}</p>
      </div>
      <JobDetailSectionCard title="추가 정보" rows={extraRows} />
    </div>
  );
}
