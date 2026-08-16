/**
 * List surface helper — composition.list fields → display parts (no skin if-trees).
 * Full PostCard cutover uses layoutVariant for visual only; field text from Field Library.
 */
import type { ResolvedTradeComposition } from "./types";
import { compositionFieldsForSurface } from "./resolve-composition";
import { labelForTradeOption } from "./option-catalogs";

function str(v: unknown): string {
  if (v == null) return "";
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

export type CompositionListAttribute = {
  fieldId: string;
  text: string;
};

/**
 * Builds secondary attribute texts for LIST from composition + post/meta.
 * Shell fields (title/price/images/location) are owned by card layout variant — skipped here.
 */
export function buildCompositionListAttributes(input: {
  composition: ResolvedTradeComposition;
  meta: Record<string, unknown>;
  post?: Record<string, unknown>;
  lang?: "ko" | "en";
}): CompositionListAttribute[] {
  const lang = input.lang ?? "ko";
  const skip = new Set([
    "images",
    "title",
    "description",
    "price",
    "location",
    "is_free_share",
    "is_price_offer",
    "trade_meet_spot",
    "amount",
    "exchange_rate",
    "exchange_rate_base",
    "exchange_rate_plus",
    "converted_amount",
    "pay_amount",
    "pay_type",
    /** Chip / hero — layout variant owns presentation */
    "car_trade",
    "deal_type",
    "listing_kind",
    "exchange_direction",
  ]);
  const out: CompositionListAttribute[] = [];
  const seenStorageKeys = new Set<string>();

  for (const field of compositionFieldsForSurface(input.composition, "list")) {
    if (skip.has(field.id)) continue;
    const def = field.definition;
    const storage = def.storage;
    let text = "";
    let storageDedupKey = field.id;
    if (storage.kind === "meta") {
      storageDedupKey = `meta:${storage.key}`;
      text = readMeta(input.meta, storage.key, def.legacyMetaKeys);
    } else if (storage.kind === "combined_meta") {
      storageDedupKey = `combined:${storage.legacyReadKey}`;
      text = readMeta(input.meta, storage.legacyReadKey);
    } else if (storage.kind === "column" && input.post) {
      storageDedupKey = `col:${storage.column}`;
      text = str(input.post[storage.column]);
    } else if (storage.kind === "meta_or_column") {
      storageDedupKey = `moc:${storage.metaKey}`;
      text = readMeta(input.meta, storage.metaKey);
      if (!text && input.post) text = str(input.post[storage.column]);
    } else if (storage.kind === "derived") {
      continue;
    }
    if (seenStorageKeys.has(storageDedupKey)) continue;
    if (!text) continue;
    seenStorageKeys.add(storageDedupKey);

    if (def.optionCatalogId && (def.widget === "select" || field.id === "body_type")) {
      text = labelForTradeOption(def.optionCatalogId, text, lang) || text;
    }
    if (def.unit === "km" && /^\d+$/.test(text.replace(/,/g, ""))) {
      const n = Number(text.replace(/,/g, ""));
      text = `${n.toLocaleString()} km`;
    }
    if (def.unit === "sqm") {
      text = `${text} sq`;
    }
    out.push({ fieldId: field.id, text });
  }
  return out;
}

/** Join list attribute texts for a secondary card line */
export function joinCompositionListAttributeLine(
  attrs: CompositionListAttribute[],
  fieldIds?: readonly string[]
): string {
  const filtered = fieldIds?.length
    ? attrs.filter((a) => fieldIds.includes(a.fieldId))
    : attrs;
  return filtered.map((a) => a.text).filter(Boolean).join(" · ");
}
