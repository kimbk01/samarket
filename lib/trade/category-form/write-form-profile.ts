/**
 * Write layout profile helpers — NOT product entry authority.
 * Product entry is always TradeCategoryWriteForm → TradeWriteForm.
 * Jobs/Exchange modules may mount only from TradeWriteForm (legacy layout) until Generic absorb completes.
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import { resolveTradeCompositionProfileId } from "@/lib/trade/category-form/composition-seeds";

export function resolveUsesJobsTradeWriteForm(category: CategoryWithSettings): boolean {
  return resolveTradeCompositionProfileId({
    icon_key: category.icon_key,
    slug: category.slug,
  }) === "jobs";
}

export function resolveUsesExchangeTradeWriteForm(category: CategoryWithSettings): boolean {
  return resolveTradeCompositionProfileId({
    icon_key: category.icon_key,
    slug: category.slug,
  }) === "exchange";
}
