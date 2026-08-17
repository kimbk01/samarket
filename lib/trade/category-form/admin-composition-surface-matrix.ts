/**
 * Admin V1 — surface verify matrix from resolved Composition (read-only preview).
 * Does not invent widgets/storage; surfaces come from Field Library only.
 */
import { getTradeFieldDefinition } from "./field-library";
import { resolveTradeComposition } from "./resolve-composition";
import { compositionFieldsForSurface } from "./resolve-composition";
import type { TradeCompositionProfileId } from "./types";

export type AdminCompositionSurfaceId = "write" | "list" | "detail" | "edit";

export type AdminCompositionSurfaceMatrix = {
  profileId: TradeCompositionProfileId | "custom";
  layoutVariant: string;
  source: "db_overlay" | "product_seed";
  counts: Record<AdminCompositionSurfaceId, number>;
  fieldSurfaces: Record<string, Partial<Record<AdminCompositionSurfaceId, boolean>>>;
};

const SURFACES: AdminCompositionSurfaceId[] = ["write", "list", "detail", "edit"];

export function buildAdminCompositionSurfaceMatrix(input: {
  iconKey: string;
  slug?: string | null;
  fieldComposition?: unknown | null;
}): AdminCompositionSurfaceMatrix {
  const composition = resolveTradeComposition({
    icon_key: input.iconKey,
    slug: input.slug ?? null,
    fieldComposition: input.fieldComposition ?? null,
  });
  const counts = {
    write: compositionFieldsForSurface(composition, "write").length,
    list: compositionFieldsForSurface(composition, "list").length,
    detail: compositionFieldsForSurface(composition, "detail").length,
    edit: compositionFieldsForSurface(composition, "edit").length,
  };
  const fieldSurfaces: AdminCompositionSurfaceMatrix["fieldSurfaces"] = {};
  for (const f of composition.fields) {
    if (f.active === false) continue;
    const def = f.definition ?? getTradeFieldDefinition(f.id);
    if (!def) continue;
    const row: Partial<Record<AdminCompositionSurfaceId, boolean>> = {};
    for (const s of SURFACES) {
      const v = def.surfaces[s];
      row[s] = v === true || typeof v === "string";
    }
    fieldSurfaces[f.id] = row;
  }
  return {
    profileId: composition.profileId,
    layoutVariant: composition.layoutVariant,
    source: composition.source,
    counts,
    fieldSurfaces,
  };
}

export function adminSurfaceBadgeChars(
  surfaces: Partial<Record<AdminCompositionSurfaceId, boolean>> | undefined
): string {
  if (!surfaces) return "";
  const parts: string[] = [];
  if (surfaces.write) parts.push("W");
  if (surfaces.list) parts.push("L");
  if (surfaces.detail) parts.push("D");
  if (surfaces.edit) parts.push("E");
  return parts.join("");
}
