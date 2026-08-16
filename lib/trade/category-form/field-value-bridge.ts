/**
 * Read/write Field Library values against posts columns + meta bag.
 */
import type { TradeFieldDefinition, TradeFieldStorage } from "./types";

export type TradeFieldValueBag = Record<string, string | boolean | number | null | undefined>;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim();
}

export function readFieldValueFromBags(
  def: TradeFieldDefinition,
  bags: { meta: Record<string, unknown>; post?: Record<string, unknown> }
): string | boolean {
  const storage = def.storage;
  if (storage.kind === "derived") return "";
  if (storage.kind === "meta") {
    if (def.widget === "boolean") {
      return bags.meta[storage.key] === true;
    }
    const direct = str(bags.meta[storage.key]);
    if (direct) return direct;
    for (const k of def.legacyMetaKeys ?? []) {
      const v = str(bags.meta[k]);
      if (v) return v;
    }
    return "";
  }
  if (storage.kind === "combined_meta") {
    return str(bags.meta[storage.legacyReadKey]);
  }
  if (storage.kind === "column") {
    if (def.widget === "boolean") return bags.post?.[storage.column] === true;
    return str(bags.post?.[storage.column]);
  }
  if (storage.kind === "meta_or_column") {
    const m = str(bags.meta[storage.metaKey]);
    if (m) return m;
    return str(bags.post?.[storage.column]);
  }
  return "";
}

/** Apply one field into meta (+ optional column hints). Does not mutate shell image arrays. */
export function writeFieldValueToMeta(
  def: TradeFieldDefinition,
  value: string | boolean,
  meta: Record<string, unknown>
): Record<string, unknown> {
  const storage = def.storage;
  const next = { ...meta };
  if (storage.kind === "meta") {
    if (def.widget === "boolean") {
      if (value === true) next[storage.key] = true;
      else delete next[storage.key];
      return next;
    }
    const s = typeof value === "string" ? value.trim() : str(value);
    if (s) next[storage.key] = s;
    else delete next[storage.key];
    return next;
  }
  if (storage.kind === "combined_meta") {
    const s = typeof value === "string" ? value.trim() : str(value);
    if (s) next[storage.writeKey] = s;
    else delete next[storage.writeKey];
    return next;
  }
  if (storage.kind === "meta_or_column") {
    const s = typeof value === "string" ? value.trim() : str(value);
    if (s) next[storage.metaKey] = def.widget === "money" || def.widget === "number" ? Number(s.replace(/,/g, "")) || s : s;
    else delete next[storage.metaKey];
    return next;
  }
  return next;
}

/** Collect meta object from a value map for composition category fields (non-shell). */
export function buildMetaFromCompositionValues(
  fields: { definition: TradeFieldDefinition; id: string }[],
  values: TradeFieldValueBag
): Record<string, unknown> {
  let meta: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.id];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "boolean") {
      meta = writeFieldValueToMeta(f.definition, raw, meta);
    } else {
      meta = writeFieldValueToMeta(f.definition, String(raw), meta);
    }
  }
  return meta;
}

export function storageWritesColumn(storage: TradeFieldStorage): string | null {
  if (storage.kind === "column") return storage.column;
  if (storage.kind === "meta_or_column") return storage.column;
  return null;
}
