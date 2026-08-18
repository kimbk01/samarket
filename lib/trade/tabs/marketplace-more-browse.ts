/**
 * UI-2 더보기 browse — CUT A/I authority as stepped member UI.
 * DO NOT: new taxonomy, new filter semantics, HOME default composition filters, new route.
 */
import {
  appendCompositionFilterSearchParams,
  resolveCompositionAttributeFilterFields,
  resolveTradeCompositionForCategory,
  sanitizeCompositionFilterSelection,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";
import { buildTradeMarketFeedHref } from "@/lib/trade/tabs/trade-market-feed-href";

export type MarketplaceMoreBrowseStep = "topic" | "category" | "options";

const DROP_PAGINATION = new Set(["page", "cursor"]);

export function marketplaceMoreBrowseHasFilterOptions(
  category: Pick<CategoryWithSettings, "icon_key" | "slug" | "settings">
): boolean {
  const composition = resolveTradeCompositionForCategory(category);
  return resolveCompositionAttributeFilterFields(composition).length > 0;
}

export function marketplaceMoreBrowseFilterFieldIds(
  category: Pick<CategoryWithSettings, "icon_key" | "slug" | "settings">
): string[] {
  return resolveCompositionAttributeFilterFields(
    resolveTradeCompositionForCategory(category)
  ).map((field) => field.id);
}

/** child 없음 / 옵션 없음이면 그 단계를 skip. "apply" = 현재 단계에서 적용 가능. */
export function advanceMarketplaceMoreBrowseStep(input: {
  from: MarketplaceMoreBrowseStep;
  childCount: number;
  hasFilterOptions: boolean;
}): MarketplaceMoreBrowseStep {
  if (input.from === "topic") {
    if (input.childCount > 0) return "category";
    if (input.hasFilterOptions) return "options";
    return "topic";
  }
  if (input.from === "category") {
    if (input.hasFilterOptions) return "options";
    return "category";
  }
  return "options";
}

export function retreatMarketplaceMoreBrowseStep(input: {
  from: MarketplaceMoreBrowseStep;
  childCount: number;
}): MarketplaceMoreBrowseStep {
  if (input.from === "options") return input.childCount > 0 ? "category" : "topic";
  if (input.from === "category") return "topic";
  return "topic";
}

/**
 * Apply href: current Marketplace scope ∩ topic ∩ child ∩ FILTER-surface filters[].
 * Preserves location / q / explicit price / status / sort. Replaces category, topic, filters[].
 */
export function buildMarketplaceMoreBrowseHref(opts: {
  categoryId: string;
  topic?: string | null;
  filters?: CompositionFilterSelection | null;
  baseSearch?: string | null;
  compositionOwner?: Pick<CategoryWithSettings, "icon_key" | "slug" | "settings"> | null;
}): string {
  const categoryId = opts.categoryId.trim();
  const base = (opts.baseSearch ?? "").trim();
  const incoming = new URLSearchParams(base.startsWith("?") ? base.slice(1) : base);
  const tradeState = parseMarketplacePublicTradeState(incoming.get("tradeState"));
  const href = buildTradeMarketFeedHref({
    categoryId,
    topic: opts.topic,
    tradeState: tradeState === "active" || tradeState === "sold" ? tradeState : null,
    baseSearch: opts.baseSearch,
  });
  const qs = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
  const sp = new URLSearchParams(qs);
  for (const key of [...sp.keys()]) {
    if (DROP_PAGINATION.has(key)) sp.delete(key);
  }
  const rawFilters = opts.filters ?? {};
  const composition = opts.compositionOwner
    ? resolveTradeCompositionForCategory(opts.compositionOwner)
    : null;
  const filters = composition
    ? sanitizeCompositionFilterSelection(rawFilters, composition)
    : rawFilters;
  appendCompositionFilterSearchParams(sp, filters);
  const out = sp.toString();
  return out ? `/market?${out}` : "/market";
}
