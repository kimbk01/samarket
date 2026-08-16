/**
 * Jobs detail rows from Category Composition (core fields).
 * Hire/seek extras outside Field Library stay in Job*DetailCards.
 */
import { applyTradeBehaviorAdapter } from "@/lib/trade/category-form/behavior-adapters";
import { buildCompositionDetailAttributes } from "@/lib/trade/category-form/detail-attributes";
import { tradeFieldAdminLabel } from "@/lib/trade/category-form/field-admin-labels";
import { resolveTradeComposition } from "@/lib/trade/category-form/resolve-composition";
import { jobWorkCategoryDisplay } from "@/lib/jobs/form-options";
import { formatPrice } from "@/lib/utils/format";

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
    formatField: (fieldId, raw, meta) => {
      if (fieldId === "listing_kind") {
        return kind === "hire" ? (input.lang === "en" ? "Hiring" : "구인") : input.lang === "en" ? "Looking for work" : "구직";
      }
      if (fieldId === "work_category" || fieldId === "work_category_other") {
        const display = jobWorkCategoryDisplay(meta, input.lang);
        if (fieldId === "work_category_other") return null;
        return display || raw || null;
      }
      if (fieldId === "pay_amount") {
        const payType = String(meta.pay_type ?? "").trim();
        if (!raw && payType === "negotiate") return input.lang === "en" ? "Negotiable" : "협의";
        return raw || null;
      }
      return raw;
    },
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
