"use client";

import type { PostWithMeta } from "@/lib/posts/schema";
import { getLocationLabel } from "@/lib/products/form-options";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  JOB_SEEKER_START_OPTIONS,
  JOB_SEEKER_VISA_OPTIONS,
  type JobSeekerStartValue,
} from "@/lib/jobs/form-options";
import { jobOptionLabel } from "@/lib/jobs/job-label-keys";
import { formatSeekTimeSlotsPipe, formatSeekerLanguagesPipe } from "@/lib/jobs/job-detail-format";
import { buildJobsCompositionDetailRows } from "@/lib/jobs/job-detail-composition-rows";
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

function seekerStartLabel(t: ReturnType<typeof useI18n>["t"], meta: Record<string, unknown>): string {
  const raw = String(meta.seeker_start ?? "").trim() as JobSeekerStartValue | "";
  const opt = JOB_SEEKER_START_OPTIONS.find((o) => o.value === raw);
  const base = opt ? jobOptionLabel(t, opt.labelKey) : raw ? raw : "";
  const d = String(meta.seeker_start_date ?? "").trim();
  if (raw === "date" && d) return `${base}: ${d}`;
  return base || "";
}

const COMPOSITION_LABEL_KEYS: Record<string, string> = {
  listing_kind: "ui_jobs_row_listing_kind",
  work_category: "ui_jobs_row_hope_industry",
  work_term: "ui_jobs_row_hope_work_term",
  pay_type: "ui_jobs_row_hope_pay",
  pay_amount: "ui_jobs_row_hope_pay",
  experience_level: "ui_jobs_row_experience",
  available_time: "ui_jobs_row_available_time",
};

export function JobSeekingDetailCards({
  post,
  meta,
  currency,
  fieldComposition,
}: {
  post: PostWithMeta;
  meta: Record<string, unknown>;
  currency: string;
  fieldComposition?: unknown;
}) {
  const { t, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";

  const availableTime = String(meta.available_time ?? "").trim();
  const slotsLine = formatSeekTimeSlotsPipe(meta);
  const timeLine = [slotsLine, availableTime].filter(Boolean).join(", ");

  const regionId = post.region?.trim() ?? "";
  const cityId = post.city?.trim() ?? "";
  const geoLine = regionId && cityId ? getLocationLabel(regionId, cityId) : "";
  const meetLine = tradeMeetDisplayLine(meta);
  const hopeWorkRegion = geoLine || meetLine || "";

  const compositionRows = buildJobsCompositionDetailRows({
    listingKind: "work",
    meta,
    post: post as unknown as Record<string, unknown>,
    currency,
    lang,
    fieldComposition,
    labelForField: (fieldId, fallback) => {
      const key = COMPOSITION_LABEL_KEYS[fieldId];
      return key ? t(key as Parameters<typeof t>[0]) : fallback;
    },
  });

  const seekRows: { label: string; value: string }[] = [];
  const used = new Set<string>();
  for (const row of compositionRows) {
    if (row.fieldId === "pay_type") continue;
    if (row.fieldId === "available_time" && timeLine) {
      seekRows.push({ label: t("ui_jobs_row_available_time"), value: timeLine });
      used.add("ui_jobs_row_available_time");
      continue;
    }
    if (used.has(row.label)) continue;
    used.add(row.label);
    seekRows.push({ label: row.label, value: row.value });
  }
  if (hopeWorkRegion) seekRows.push({ label: t("ui_jobs_row_hope_region"), value: hopeWorkRegion });

  const visaRaw = String(meta.seeker_visa ?? "").trim();
  const visaOpt = JOB_SEEKER_VISA_OPTIONS.find((o) => o.value === visaRaw);
  const visaLabel = visaOpt ? jobOptionLabel(t, visaOpt.labelKey) : visaRaw || "";

  const langLine = formatSeekerLanguagesPipe(meta);
  const startLine = seekerStartLabel(t, meta);

  const extraRows: { label: string; value: string }[] = [];
  if (langLine) extraRows.push({ label: t("ui_jobs_row_languages_available"), value: langLine });
  if (visaLabel) extraRows.push({ label: t("ui_jobs_row_visa_status"), value: visaLabel });
  if (startLine) extraRows.push({ label: t("ui_jobs_row_start_availability"), value: startLine });

  if (geoLine && meetLine && meetLine !== geoLine) {
    extraRows.push({ label: t("ui_jobs_row_mobility_region"), value: meetLine });
  }

  const content = (post.content ?? "").trim();

  return (
    <div className="flex flex-col gap-2">
      <JobDetailSectionCard title={t("ui_jobs_detail_seek_section")} rows={seekRows} />
      <div className="rounded-ui-rect border border-[#e4e6eb] bg-[#fafbfc] px-3 py-2.5">
        <h3 className={`${TRADE_WRITE_FB_FIELD_HEAD} mb-0`}>{t("ui_jobs_detail_intro_heading")}</h3>
        <p className={`mt-1 ${TRADE_FB_DETAIL_BODY}`}>{content || "—"}</p>
      </div>
      <JobDetailSectionCard title={t("ui_jobs_detail_extra_section")} rows={extraRows} />
    </div>
  );
}
