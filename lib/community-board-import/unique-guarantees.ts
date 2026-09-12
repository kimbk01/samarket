/**
 * P0 DB UNIQUE GUARANTEE
 *
 * Contract documentation ≠ live DB enforcement.
 * Until migration is applied and verified against live DB:
 *   DB UNIQUE ENFORCEMENT = NOT_PROVEN
 */

export const BOARD_IMPORT_UNIQUE_KEYS = {
  sourceBoard: ["site_key", "board_key"] as const,
  sourceArticle: ["source_board_id", "stable_article_identity"] as const,
  publishLink: ["source_article_id"] as const,
} as const;

/** Code-level contract only until live constraint proven. */
export const BOARD_IMPORT_DB_UNIQUE_ENFORCEMENT: "NOT_PROVEN" | "PASS" = "NOT_PROVEN";

export type BoardImportAuditIdentityFields = {
  source_board_identity: string;
  source_article_identity: string;
  canonical_source_url: string;
  source_fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  source_changed_at: string | null;
  published_post_id: string | null;
};

export function formatSourceBoardIdentityKey(siteKey: string, boardKey: string): string {
  return `${siteKey}|${boardKey}`;
}
