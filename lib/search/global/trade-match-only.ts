/**
 * Global Search Trade — MATCH-ONLY contract.
 *
 * Canonical searchable field is Marketplace hard-query authority:
 * `applyMarketplaceQueryToPostgrest` → PostgREST `title ILIKE %q%`.
 *
 * `/market?q=` CUT C (T1–T5 discovery tail) is a different product surface.
 * This module must not import ranking / expansion.
 */

export const GLOBAL_SEARCH_TRADE_API_PATH = "/api/search/trade";

export const GLOBAL_SEARCH_TRADE_LIMIT = 10;

export const GLOBAL_SEARCH_TRADE_MATCH_FIELD = "title" as const;
