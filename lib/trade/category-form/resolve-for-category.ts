/**
 * Category → resolved Trade composition (seed or Admin overlay).
 *
 * CUT A1: option owner is the ROOT topic (parent_id null), not a child category.
 * Child rows are name / order / active / list narrowing only.
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeComposition, type ResolvedTradeComposition } from "@/lib/trade/category-form";

export type TradeCompositionCategoryRow = Pick<
  CategoryWithSettings,
  "id" | "parent_id" | "icon_key" | "slug" | "settings"
>;

/**
 * 1-hop ROOT topic row for option composition.
 * Missing/invalid parent → keep the requested row (no invented taxonomy fallback).
 */
export function resolveTradeCompositionRootRow<T extends { id: string; parent_id?: string | null }>(
  categoryId: string | null | undefined,
  byId: ReadonlyMap<string, T>
): T | null {
  const id = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!id) return null;
  const row = byId.get(id);
  if (!row) return null;
  const parentId = typeof row.parent_id === "string" ? row.parent_id.trim() : "";
  if (!parentId) return row;
  return byId.get(parentId) ?? row;
}

/** Child row → parent 1-hop. Missing parent → keep the requested row. */
export function selectTradeCompositionOwnerRow<T extends { parent_id?: string | null }>(
  row: T,
  parent: T | null | undefined
): T {
  const parentId = typeof row.parent_id === "string" ? row.parent_id.trim() : "";
  if (!parentId) return row;
  return parent ?? row;
}

/**
 * Listing narrowing id vs option-composition owner id.
 * Child listing stays child; composition owner is the ROOT topic.
 */
export function splitTradeListingAndCompositionOwnerIds(
  categoryId: string | null | undefined,
  byId: ReadonlyMap<string, { id: string; parent_id?: string | null }>
): { listingCategoryId: string | null; compositionOwnerId: string | null } {
  const listing = typeof categoryId === "string" ? categoryId.trim() : "";
  if (!listing) return { listingCategoryId: null, compositionOwnerId: null };
  const owner = resolveTradeCompositionRootRow(listing, byId);
  return { listingCategoryId: listing, compositionOwnerId: owner?.id ?? listing };
}

/**
 * Edit form: keep stored id / parent_id / name for persist + history.
 * Option authority (icon/slug/overlay) comes from the ROOT topic.
 */
export function withTradeCompositionOwner(
  stored: CategoryWithSettings,
  owner: CategoryWithSettings
): CategoryWithSettings {
  const ownerOverlay = owner.settings?.field_composition ?? null;
  return {
    ...stored,
    icon_key: owner.icon_key,
    slug: owner.slug,
    settings: stored.settings
      ? { ...stored.settings, field_composition: ownerOverlay }
      : owner.settings
        ? { ...owner.settings, field_composition: ownerOverlay }
        : null,
  };
}

export function resolveTradeCompositionForCategory(
  category: Pick<CategoryWithSettings, "icon_key" | "slug" | "settings">
): ResolvedTradeComposition {
  return resolveTradeComposition({
    icon_key: category.icon_key,
    slug: category.slug,
    fieldComposition: category.settings?.field_composition ?? null,
  });
}

/**
 * Resolve composition for a stored `posts.trade_category_id` (root or child).
 * `byId` must include the row and, when present, its direct parent.
 */
export function resolveTradeCompositionForCategoryId(
  categoryId: string | null | undefined,
  byId: ReadonlyMap<string, TradeCompositionCategoryRow>
): ResolvedTradeComposition | null {
  const root = resolveTradeCompositionRootRow(categoryId, byId);
  if (!root) return null;
  return resolveTradeCompositionForCategory(root);
}
