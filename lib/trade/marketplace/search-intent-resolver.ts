/**
 * SEARCH-LOCATION-FRESH-1 — inferred search intent (ranking boost only, never membership).
 *
 * ROOT label match ≠ explicit category scope (M-HARD). TOPIC graph is a separate boost signal.
 */
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  resolveSearchExpansionHints,
  normalizeSearchExpansionText,
  type SearchExpansionHints,
} from "@/lib/trade/marketplace/search-candidate-expansion";
import type { SearchTopicGraphContext } from "@/lib/trade/marketplace/search-topic-graph-context";

export type MarketplaceSearchIntent = {
  /** True when any meaningful boost signal exists (ROOT / TOPIC / catalog / title). */
  resolved: boolean;
  phrase: string;
  tokens: string[];
  /** ROOT parent ids for relevance scoring — not SQL membership. */
  rootBoostParentIds: string[];
  expansionHints: SearchExpansionHints;
};

function rootLabels(root: Pick<CategoryWithSettings, "name" | "name_en" | "slug">): string[] {
  return [
    normalizeSearchExpansionText(root.name),
    normalizeSearchExpansionText(root.name_en),
    normalizeSearchExpansionText(root.slug),
  ].filter((s) => s.length >= 2);
}

function phraseMatchesRootLabel(
  phrase: string,
  tokens: string[],
  labels: string[]
): boolean {
  for (const label of labels) {
    if (label.length >= 2 && phrase.includes(label)) return true;
    if (tokens.some((token) => token === label || (token.length >= 2 && label.includes(token)))) {
      return true;
    }
  }
  return false;
}

function expansionHintsHaveCatalogSignal(hints: SearchExpansionHints): boolean {
  return (
    hints.makes.length > 0 ||
    hints.models.length > 0 ||
    hints.bodyTypes.length > 0 ||
    hints.metaCatalogMatches.length > 0
  );
}

/**
 * Resolve q into ranking boost hints. Does not mutate eligible pool membership.
 */
export function resolveMarketplaceSearchIntent(input: {
  q: string | null | undefined;
  homeRoots: Pick<CategoryWithSettings, "id" | "name" | "name_en" | "slug">[];
  topicGraph?: SearchTopicGraphContext | null;
}): MarketplaceSearchIntent | null {
  const hints = resolveSearchExpansionHints(input.q);
  if (!hints) return null;

  const phrase = hints.phrase;
  const tokens = hints.tokens;
  const rootBoostParentIds: string[] = [];

  for (const root of input.homeRoots) {
    const id = root.id?.trim();
    if (!id) continue;
    if (phraseMatchesRootLabel(phrase, tokens, rootLabels(root))) {
      if (!rootBoostParentIds.includes(id)) rootBoostParentIds.push(id);
    }
  }

  const topicMatched =
    (input.topicGraph?.matchedTopicCategoryIds.length ?? 0) > 0 ||
    (input.topicGraph?.siblingTopicCategoryIds.length ?? 0) > 0;
  const catalogSignal = expansionHintsHaveCatalogSignal(hints);
  const rootSignal = rootBoostParentIds.length > 0;

  const resolved = rootSignal || topicMatched || catalogSignal;

  return {
    resolved,
    phrase,
    tokens,
    rootBoostParentIds,
    expansionHints: hints,
  };
}

/** Scoring-only ROOT membership — not eligible pool intersection. */
export function listingMatchesRootBoost(
  tradeCategoryId: string | null | undefined,
  rootBoostParentIds: string[],
  rootExpandedIdsByParent: Record<string, string[]>
): boolean {
  const cid = tradeCategoryId?.trim() ?? "";
  if (!cid || rootBoostParentIds.length === 0) return false;
  for (const parentId of rootBoostParentIds) {
    const expanded = rootExpandedIdsByParent[parentId];
    if (expanded?.includes(cid)) return true;
  }
  return false;
}
