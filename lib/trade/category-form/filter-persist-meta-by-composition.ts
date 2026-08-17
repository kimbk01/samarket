/**
 * Persist trade meta through composition: Admin overlay active:false must not write.
 * Shell/policy keys that are not Field Library catalog keys are kept.
 */
import { getTradeFieldDefinition } from "./field-library";
import { getTradeSeedComposition } from "./composition-seeds";
import type { ResolvedTradeComposition } from "./types";

export function metaKeysForCompositionFieldId(fieldId: string): string[] {
  const def = getTradeFieldDefinition(fieldId);
  if (!def) return [];
  const storage = def.storage;
  if (storage.kind === "meta") {
    return [storage.key, ...(def.legacyMetaKeys ?? [])];
  }
  if (storage.kind === "combined_meta") {
    return [...new Set([storage.writeKey, storage.legacyReadKey])];
  }
  if (storage.kind === "meta_or_column") {
    return [storage.metaKey];
  }
  return [];
}

export function filterTradePersistMetaByComposition(
  meta: Record<string, unknown>,
  composition: ResolvedTradeComposition
): Record<string, unknown> {
  const seed =
    composition.profileId === "custom" ? null : getTradeSeedComposition(composition.profileId);
  const catalogKeys = new Set<string>();
  for (const row of seed?.fields ?? []) {
    for (const key of metaKeysForCompositionFieldId(row.id)) catalogKeys.add(key);
  }
  const activeKeys = new Set<string>();
  for (const field of composition.fields) {
    for (const key of metaKeysForCompositionFieldId(field.id)) activeKeys.add(key);
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (catalogKeys.has(key) && !activeKeys.has(key)) continue;
    next[key] = value;
  }
  return next;
}

/**
 * When Admin drops `car_trade`, WRITE still uses sell widgets.
 * Do not require buy/sell pick, and still require remaining sell fields.
 */
export function resolveUsedCarWriteTradeMode(
  writeFieldIds: ReadonlySet<string>,
  selected: "buy" | "sell" | null
): "buy" | "sell" | null {
  if (!writeFieldIds.has("car_trade")) return "sell";
  return selected;
}
