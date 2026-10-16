/**
 * Search step 2 — SQL candidate filter for discovery ranking (superset of bands 0–4).
 *
 * `rankMarketplaceDiscoveryBatch` puts a listing in bands 0–4 only through substring /
 * equality checks on `title`, a few `meta` keys and category-id sets. Every such check
 * implies that at least one *word* of a needle appears in one of those columns
 * (case-insensitive), or that the category id is in one of the id sets. This module
 * emits exactly that OR-filter, so:
 *
 *   rows NOT matching the filter  ⇒  band 5 (eligible tail)            — never a match
 *   rows matching the filter      ⇒  ranked in-app exactly as before   — band 0–5
 *
 * The complement (`negations`) is NULL-safe, so `filter` and `NOT filter` partition the
 * eligible set (no row in both, no row in neither).
 *
 * Returns null when a needle cannot be expressed safely (caller falls back to ranking
 * the whole pool — the previous, always-correct path).
 */
import type { MarketplaceSearchDiscoveryContext } from "@/lib/trade/marketplace/load-marketplace-search-discovery-context";
import { normalizeSearchExpansionText } from "@/lib/trade/marketplace/search-candidate-expansion";

/**
 * Text the band matchers read: title + these meta keys. Stored on posts as `search_text`
 * (migration 20270506120000_trade_search_text_trgm, pg_trgm GIN) — parts joined by spaces.
 */
export const SEARCH_TEXT_META_KEYS = [
  "car_model",
  "car_body_type",
  "deal_type",
  "estate_type",
  "listing_kind",
  "work_category",
  "exchange_direction",
  "car_trade",
] as const;

/** Same expression as the generated column (tests / emulators). */
export function computeSearchText(row: { title?: unknown; meta?: unknown }): string {
  const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {};
  const part = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v));
  return [part(row.title), ...SEARCH_TEXT_META_KEYS.map((k) => part(meta[k]))].join(" ");
}

/** Characters that would break a PostgREST logic-tree value or an ILIKE pattern. */
const UNSAFE_NEEDLE_CHARS = /[,()"\\%_*:]/;

export type SearchCandidateSqlFilter = {
  /** PostgREST `.or()` body — rows that may rank in bands 0–4. */
  orBody: string;
  /** NULL-safe complement — apply each entry as its own `.or()` group (ANDed). */
  negations: string[];
  /** Words used (diagnostics / tests). */
  words: string[];
};

function wordsOf(raw: string): string[] {
  return normalizeSearchExpansionText(raw)
    .split(" ")
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Split a word on characters PostgREST / ILIKE cannot carry. Substring of the word ⇒ still a
 * superset. Empty result ⇒ the word cannot be represented (caller falls back).
 */
function safePieces(word: string): string[] {
  return word.split(UNSAFE_NEEDLE_CHARS).filter((p) => p.length > 0);
}

export function buildSearchCandidateSqlFilter(
  discovery: MarketplaceSearchDiscoveryContext,
  inferredBodyTypes: string[] = []
): SearchCandidateSqlFilter | null {
  const hints = discovery.intent.expansionHints;
  /**
   * `strongRelated` tests `tokens.filter(len ≥ 3).every(...)`: when every token is shorter than
   * 3 chars that list is empty and `every` is true for ALL rows (whole pool = band 2), so no
   * SQL filter can be a superset — use the full-pool path for these queries.
   */
  if (hints.tokens.length > 0 && hints.tokens.every((t) => t.length < 3)) return null;
  const needles = [
    hints.phrase,
    ...hints.tokens,
    ...hints.makes,
    ...hints.models,
    ...hints.bodyTypes,
    ...inferredBodyTypes,
    ...hints.metaCatalogMatches.map((m) => m.value),
  ];
  const words = new Set<string>();
  for (const needle of needles) {
    for (const word of wordsOf(needle)) {
      const pieces = safePieces(word);
      if (pieces.length === 0) return null;
      /** One piece per word is enough for a superset; keep the longest (most selective). */
      words.add(pieces.reduce((a, b) => (b.length > a.length ? b : a)));
    }
  }

  const categoryIds = new Set<string>();
  for (const parentId of discovery.intent.rootBoostParentIds) {
    for (const id of discovery.rootExpandedIdsByParent[parentId] ?? []) {
      if (id?.trim()) categoryIds.add(id.trim());
    }
  }
  for (const id of discovery.topicGraph?.matchedTopicCategoryIds ?? []) {
    if (id?.trim()) categoryIds.add(id.trim());
  }
  for (const id of discovery.topicGraph?.siblingTopicCategoryIds ?? []) {
    if (id?.trim()) categoryIds.add(id.trim());
  }
  for (const id of categoryIds) {
    if (UNSAFE_NEEDLE_CHARS.test(id)) return null;
  }

  const positive: string[] = [];
  const negations: string[] = [];
  const sortedWords = [...words].sort();
  for (const word of sortedWords) {
    /** search_text is never NULL (coalesce) — plain NOT ILIKE is the exact complement. */
    positive.push(`search_text.ilike.%${word}%`);
    negations.push(`search_text.not.ilike.%${word}%`);
  }
  if (categoryIds.size > 0) {
    const ids = [...categoryIds].sort().join(",");
    positive.push(`trade_category_id.in.(${ids})`);
    /** trade_category_id is NOT NULL on posts. */
    negations.push(`trade_category_id.not.in.(${ids})`);
  }
  if (positive.length === 0) return null;
  return { orBody: positive.join(","), negations, words: sortedWords };
}
