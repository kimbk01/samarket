/**
 * Jobs detail rows from Category Composition (core fields).
 * Hire/seek extras outside Field Library stay in Job*DetailCards.
 */
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import {
  PAY_TYPE_LABELS,
  WORK_TERM_LABELS,
  jobTimeSlotsDisplay,
  jobWorkCategoryDisplay,
} from "@/lib/jobs/form-options";
import { formatPrice } from "@/lib/utils/format";
import { translateBy } from "@/lib/i18n/translate-by";

export type JobDetailCompositionRow = { fieldId: string; label: string; value: string };

const HIRE_COMPOSITION_IDS = [
  "listing_kind",
  "work_category",
  "work_category_other",
  "work_term",
  "work_date_start",
  "work_date_end",
  "pay_type",
  "pay_amount",
  "company_name",
] as const;

const SEEK_COMPOSITION_IDS = [
  "listing_kind",
  "work_category",
  "work_category_other",
  "work_term",
  "pay_type",
  "pay_amount",
  "experience_level",
  "available_time",
] as const;

function parseAmount(raw: string): number {
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function formatJobsCompositionDetailField(input: {
  fieldId: string;
  rawValue: string;
  meta: Record<string, unknown>;
  listingKind: "hire" | "work" | string;
  lang: "ko" | "en";
}): string | null {
  const kind = String(input.listingKind).trim() === "hire" ? "hire" : "work";
  if (input.fieldId === "listing_kind") {
    return kind === "hire"
      ? translateBy(input.lang, "jobs_hiring")
      : translateBy(input.lang, "jobs_looking_for_work");
  }
  if (input.fieldId === "work_category" || input.fieldId === "work_category_other") {
    const display = jobWorkCategoryDisplay(input.meta, input.lang);
    if (input.fieldId === "work_category_other") return null;
    return display || input.rawValue || null;
  }
  if (input.fieldId === "pay_amount") {
    const payType = String(input.meta.pay_type ?? "").trim();
    if (!input.rawValue && payType === "negotiate") return translateBy(input.lang, "jobs_negotiable");
    return input.rawValue || null;
  }
  /**
   * 감사 J1 (2026-11-22): 구직 근무형태(`short_alba`·`parttime`·`remote`·`discuss`)·급여 「협의」(`negotiate`)는
   * 구성 카탈로그에 없어 내부 값이 그대로 보였다 — 일자리 라벨 키로 번역한다(카탈로그에 있는 값은 이미 라벨).
   */
  if (input.fieldId === "work_term") {
    const key = WORK_TERM_LABELS[input.rawValue.trim()];
    return key ? translateBy(input.lang, key) : input.rawValue;
  }
  if (input.fieldId === "pay_type") {
    const key = PAY_TYPE_LABELS[input.rawValue.trim()];
    return key ? translateBy(input.lang, key) : input.rawValue;
  }
  if (input.fieldId === "available_time") {
    return jobTimeSlotsDisplay(input.meta, input.lang) || input.rawValue;
  }
  return input.rawValue;
}

export function buildJobsCompositionDetailRows(input: {
  listingKind: "hire" | "work" | string;
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
  currency: string;
  lang: "ko" | "en";
  fieldComposition?: unknown;
  /** Prefer product i18n labels when provided */
  labelForField?: (fieldId: string, fallback: string) => string;
}): JobDetailCompositionRow[] {
  const kind = String(input.listingKind).trim() === "hire" ? "hire" : "work";
  const composition = resolveTradeComposition({
    icon_key: "jobs",
    fieldComposition: input.fieldComposition ?? null,
  });
  const adapted = applyTradeBehaviorAdapter(composition, {
    listingKind: kind,
    workCategory: String(input.meta.work_category ?? "").trim() || null,
  });
  const allow = new Set(kind === "hire" ? HIRE_COMPOSITION_IDS : SEEK_COMPOSITION_IDS);
  const attrs = buildCompositionDetailAttributes({
    composition,
    adaptedFields: adapted.filter((f) => allow.has(f.id as (typeof HIRE_COMPOSITION_IDS)[number])),
    meta: input.meta,
    post: input.post,
    lang: input.lang,
    formatMoney: (raw) => formatPrice(parseAmount(raw), input.currency),
    formatField: (fieldId, rawValue, meta) =>
      formatJobsCompositionDetailField({
        fieldId,
        rawValue,
        meta,
        listingKind: kind,
        lang: input.lang,
      }),
  });

  const out: JobDetailCompositionRow[] = [];
  const seen = new Set<string>();
  for (const a of attrs) {
    if (seen.has(a.fieldId)) continue;
    seen.add(a.fieldId);
    const fallback = tradeFieldAdminLabel(a.fieldId, input.lang);
    const label = input.labelForField?.(a.fieldId, fallback) ?? fallback;
    out.push({ fieldId: a.fieldId, label, value: a.value });
  }
  return out;
}
