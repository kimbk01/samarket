/**
 * Server-only: category row → resolved composition for FILTER query sanitization.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTradeComposition } from "./resolve-composition";
import type { ResolvedTradeComposition } from "./types";
import {
  buildCompositionFilterClauses,
  parseCompositionFilterSearchParams,
  type CompositionFilterClause,
} from "./composition-filter-query";

export async function loadResolvedTradeCompositionByCategoryId(
  sb: SupabaseClient<any>,
  categoryId: string | null | undefined
): Promise<ResolvedTradeComposition | null> {
  const id = categoryId?.trim();
  if (!id) return null;
  const { data, error } = await sb
    .from("categories")
    .select("icon_key, slug, category_settings(field_composition)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const settings = Array.isArray(data.category_settings)
    ? data.category_settings[0]
    : data.category_settings;
  return resolveTradeComposition({
    icon_key: typeof data.icon_key === "string" ? data.icon_key : null,
    slug: typeof data.slug === "string" ? data.slug : null,
    fieldComposition: settings?.field_composition ?? null,
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
