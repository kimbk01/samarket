/**
 * Write layout profile helpers — NOT product entry authority.
 * Product entry is always TradeCategoryWriteForm → TradeWriteForm → composition.profileId body.
 * Jobs/Exchange bodies live under `generic/*ExtendedWriteFields` until shell merge (Phase 1b).
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
