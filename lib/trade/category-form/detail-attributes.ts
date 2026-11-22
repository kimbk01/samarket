/**
 * Detail surface attribute rows from composition (no new skin if-trees).
 */
import type { ResolvedTradeComposition } from "./types";
import { compositionFieldsForSurface } from "./resolve-composition";
import { labelForTradeOption } from "./option-catalogs";
import type { AdaptedCompositionField } from "./behavior-adapters";
import { USED_CAR_BRANDS } from "@/lib/trade/used-car-form-catalog";
import { translateBy } from "@/lib/i18n/translate-by";

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string" && x.trim() !== "" && x !== "identity_confirm")
      .join(", ");
  }
  return String(v).trim();
}

function readMeta(meta: Record<string, unknown>, key: string, legacy?: readonly string[]): string {
  const direct = str(meta[key]);
  if (direct) return direct;
  if (legacy) {
    for (const k of legacy) {
      const v = str(meta[k]);
      if (v) return v;
    }
  }
  return "";
}

export type CompositionDetailAttribute = {
  fieldId: string;
  value: string;
};

const SKIP_DETAIL = new Set([
  "images",
  "title",
  "description",
  "location",
  "trade_meet_spot",
  "is_price_offer",
  "is_free_share",
]);

export function buildCompositionDetailAttributes(input: {
  composition: ResolvedTradeComposition;
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
  lang?: "ko" | "en";
  /** When set, only these field ids (in order) are projected */
  fieldIds?: readonly string[];
  /** Prefer adapted visibility list over detail surface defaults */
  adaptedFields?: readonly AdaptedCompositionField[];
  formatMoney?: (raw: string) => string;
  /** Optional per-field display override (e.g. exchange rate line) */
  formatField?: (fieldId: string, rawValue: string, meta: Record<string, unknown>) => string | null;
  /** Skip these field ids (e.g. hero already shows price/deal) */
  skipFieldIds?: readonly string[];
}): CompositionDetailAttribute[] {
  const lang = input.lang ?? "ko";
  const skipExtra = new Set(input.skipFieldIds ?? []);
  const out: CompositionDetailAttribute[] = [];

  const fields =
    input.adaptedFields?.filter((f) => f.visible) ??
    (input.fieldIds
      ? input.composition.fields.filter((f) => input.fieldIds!.includes(f.id))
      : compositionFieldsForSurface(input.composition, "detail"));

  for (const field of fields) {
    if (SKIP_DETAIL.has(field.id) || skipExtra.has(field.id)) continue;
    const def = field.definition;
    const storage = def.storage;
    let value = "";
    if (storage.kind === "meta") {
      value = readMeta(input.meta, storage.key, def.legacyMetaKeys);
    } else if (storage.kind === "combined_meta") {
      /**
       * 제조사·모델은 한 칸(`car_model` = 「Toyota Vios」)에 함께 저장된다 — 상세에서는 칸별로 나눠 보인다
       * (2026-10-28 실기: 「제조사 Toyota Vios · 모델 Toyota Vios」).
       */
      value = splitCombinedMetaPart(readMeta(input.meta, storage.legacyReadKey), storage.parts, field.id);
    } else if (storage.kind === "column" && input.post) {
      value = str(input.post[storage.column]);
    } else if (storage.kind === "meta_or_column") {
      value = readMeta(input.meta, storage.metaKey);
      if (!value && input.post) value = str(input.post[storage.column]);
    } else if (storage.kind === "derived") {
      /**
       * 감사 X2 (2026-11-22): 계산값(환전 KRW 환산액)은 글쓰기 때 같은 id 로 meta 에 저장된다.
       * 표시 형식은 화면 포맷터가 정한다 — 포맷터가 없는 화면은 예전처럼 건너뛴다.
       */
      if (!input.formatField) continue;
      value = readMeta(input.meta, field.id);
    }
    if (def.widget === "boolean") {
      if (storage.kind === "meta") {
        const b = input.meta[storage.key];
        if (b === true) value = translateBy(lang, "trade_yes");
        /** 감사 C3 (2026-11-22): 사고 여부는 필수 칸 — 「없음」도 정보다(무사고) */
        else if (b === false) value = field.id === "has_accident" ? translateBy(lang, "ui_car_accident_no") : "";
      }
    }
    if (!value && field.id === "price" && input.post?.price != null) {
      value = str(input.post.price);
    }
    if (!value) continue;
    if (def.optionCatalogId && def.widget === "select") {
      value = labelForTradeOption(def.optionCatalogId, value, lang);
    }
    if (def.widget === "money" && input.formatMoney) {
      value = input.formatMoney(value);
    }
    if (def.unit === "km" && /^\d+$/.test(value.replace(/,/g, ""))) {
      value = `${Number(value.replace(/,/g, "")).toLocaleString()} km`;
    }
    if (def.unit === "sqm") value = `${value} sq`;
    if (input.formatField) {
      const formatted = input.formatField(field.id, value, input.meta);
      if (formatted == null) continue;
      value = formatted;
    }
    if (!value) continue;
    out.push({ fieldId: field.id, value });
  }
  return out;
}

/** 「Toyota Vios …」 → 제조사(parts[0]) = 「Toyota」, 모델(parts[1]) = 「Vios …」. 브랜드를 못 찾으면 원문 그대로 */
export function splitCombinedMetaPart(
  combined: string,
  parts: readonly string[] | undefined,
  fieldId: string
): string {
  const text = combined.trim();
  if (!text || !parts || parts.length < 2) return text;
  const lower = text.toLowerCase();
  const brand = USED_CAR_BRANDS.find((b) => {
    const label = b.label.toLowerCase();
    return lower === label || lower.startsWith(`${label} `);
  });
  /**
   * 브랜드를 못 찾으면(「기타」 직접 입력) 원문은 제조사 칸에만 둔다.
   * 감사 C3 (2026-11-22): 모델 칸에도 원문을 내면 두 칸에 같은 값이 나온다.
   */
  if (!brand) return fieldId === parts[1] ? "" : text;
  if (fieldId === parts[0]) return brand.label;
  if (fieldId === parts[1]) return text.slice(brand.label.length).trim() || text;
  return text;
}
