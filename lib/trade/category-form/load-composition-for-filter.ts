/**
 * Server-only: category row → resolved composition for FILTER query sanitization.
 * CUT A1/A2 leak fix: child id 1-hop to ROOT topic overlay (missing parent → keep requested row).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTradeComposition } from "./resolve-composition";
import type { ResolvedTradeComposition } from "./types";
import { selectTradeCompositionOwnerRow } from "./resolve-for-category";
import {
  buildCompositionFilterClauses,
  parseCompositionFilterSearchParams,
  type CompositionFilterClause,
} from "./composition-filter-query";

type CompositionLoadRow = {
  parent_id: string | null;
  icon_key: string | null;
  slug: string | null;
  field_composition: unknown | null;
};

function settingsFromJoin(data: { category_settings?: unknown }): { field_composition?: unknown } | null {
  const settings = Array.isArray(data.category_settings)
    ? data.category_settings[0]
    : data.category_settings;
  return (settings as { field_composition?: unknown } | null) ?? null;
}

async function fetchCompositionLoadRow(
  sb: SupabaseClient<any>,
  id: string
): Promise<CompositionLoadRow | null> {
  const { data, error } = await sb
    .from("categories")
    .select("parent_id, icon_key, slug, category_settings(field_composition)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    parent_id: typeof data.parent_id === "string" ? data.parent_id : null,
    icon_key: typeof data.icon_key === "string" ? data.icon_key : null,
    slug: typeof data.slug === "string" ? data.slug : null,
    field_composition: settingsFromJoin(data)?.field_composition ?? null,
  };
}

export async function loadResolvedTradeCompositionByCategoryId(
  sb: SupabaseClient<any>,
  categoryId: string | null | undefined
): Promise<ResolvedTradeComposition | null> {
  const id = categoryId?.trim();
  if (!id) return null;
  const row = await fetchCompositionLoadRow(sb, id);
  if (!row) return null;
  const parentId = typeof row.parent_id === "string" ? row.parent_id.trim() : "";
  const parent = parentId ? await fetchCompositionLoadRow(sb, parentId) : null;
  const owner = selectTradeCompositionOwnerRow(row, parent);
  return resolveTradeComposition({
    icon_key: owner.icon_key,
    slug: owner.slug,
    fieldComposition: owner.field_composition ?? null,
  });
}

export async function resolveCompositionFilterClausesFromRequest(
  sb: SupabaseClient<any>,
  categoryId: string | null | undefined,
  searchParams: URLSearchParams
): Promise<CompositionFilterClause[]> {
  const raw = parseCompositionFilterSearchParams(searchParams);
  if (Object.keys(raw).length === 0) return [];
  const composition = await loadResolvedTradeCompositionByCategoryId(sb, categoryId);
  if (!composition) return [];
  return buildCompositionFilterClauses(raw, composition);
}
