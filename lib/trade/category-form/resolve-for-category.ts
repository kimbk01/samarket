/**
 * Category → resolved Trade composition (seed or Admin overlay).
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeComposition, type ResolvedTradeComposition } from "@/lib/trade/category-form";

export function resolveTradeCompositionForCategory(
  category: Pick<CategoryWithSettings, "icon_key" | "slug" | "settings">
): ResolvedTradeComposition {
  return resolveTradeComposition({
    icon_key: category.icon_key,
    slug: category.slug,
    fieldComposition: category.settings?.field_composition ?? null,
  });
}
