/**
 * Resolve Category → Field Composition for Write/List/Detail/Edit/Filter.
 * Authority: category_settings.field_composition overlay, else Product seed.
 */
import { getTradeFieldDefinition } from "./field-library";
import {
  getTradeSeedComposition,
  resolveTradeCompositionProfileId,
} from "./composition-seeds";
import { parseTradeFieldCompositionPayload } from "./parse-field-composition";
import type {
  ResolvedTradeComposition,
  ResolvedTradeCompositionField,
  TradeCompositionFieldOverlay,
  TradeCompositionProfileId,
  TradeLayoutVariant,
} from "./types";

export type ResolveTradeCompositionInput = {
  icon_key?: string | null;
  slug?: string | null;
  /** Raw JSONB from category_settings.field_composition */
  fieldComposition?: unknown;
};

function materializeFields(
  overlays: TradeCompositionFieldOverlay[]
): ResolvedTradeCompositionField[] {
  const out: ResolvedTradeCompositionField[] = [];
  const sorted = [...overlays].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const row of sorted) {
    if (row.active === false) continue;
    const definition = getTradeFieldDefinition(row.id);
    if (!definition) continue;
    out.push({ ...row, active: true, definition });
  }
  return out;
}

export function resolveTradeComposition(
  input: ResolveTradeCompositionInput
): ResolvedTradeComposition {
  const profileId = resolveTradeCompositionProfileId({
    icon_key: input.icon_key,
    slug: input.slug,
  });
  const seed = profileId ? getTradeSeedComposition(profileId) : null;
  const overlay = parseTradeFieldCompositionPayload(input.fieldComposition);

  if (overlay) {
    return {
      profileId: (profileId ?? "custom") as TradeCompositionProfileId | "custom",
      layoutVariant: (seed?.layoutVariant ?? "general-card") as TradeLayoutVariant,
      behaviorAdapterId: seed?.behaviorAdapterId ?? null,
      source: "db_overlay",
      fields: materializeFields(overlay.fields),
    };
  }

  if (seed) {
    return {
      profileId: seed.profileId,
      layoutVariant: seed.layoutVariant,
      behaviorAdapterId: seed.behaviorAdapterId,
      source: "product_seed",
      fields: materializeFields(seed.fields),
    };
  }

  return {
    profileId: "custom",
    layoutVariant: "general-card",
    behaviorAdapterId: null,
    source: "product_seed",
    fields: [],
  };
}

/** Fields marked for a surface */
export function compositionFieldsForSurface(
  composition: ResolvedTradeComposition,
  surface: "write" | "list" | "detail" | "edit" | "filter"
): ResolvedTradeCompositionField[] {
  return composition.fields.filter((f) => {
    const s = f.definition.surfaces[surface];
    if (s === false || s == null) return false;
    return true;
  });
}
