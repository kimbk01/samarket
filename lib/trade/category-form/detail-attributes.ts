/**
 * Detail surface attribute rows from composition (no new skin if-trees).
 */
import type { ResolvedTradeComposition } from "./types";
import { compositionFieldsForSurface } from "./resolve-composition";
import { labelForTradeOption } from "./option-catalogs";
import type { AdaptedCompositionField } from "./behavior-adapters";

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
      value = readMeta(input.meta, storage.legacyReadKey);
    } else if (storage.kind === "column" && input.post) {
      value = str(input.post[storage.column]);
    } else if (storage.kind === "meta_or_column") {
      value = readMeta(input.meta, storage.metaKey);
      if (!value && input.post) value = str(input.post[storage.column]);
    } else if (storage.kind === "derived") {
      continue;
    }
    if (def.widget === "boolean") {
      if (storage.kind === "meta") {
        const b = input.meta[storage.key];
        if (b === true) value = lang === "en" ? "Yes" : "예";
        else if (b === false) value = "";
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
