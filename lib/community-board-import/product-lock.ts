/**
 * DIBAY EXTERNAL BOARD IMPORT — OWNER FINAL PRODUCT LOCK
 *
 * Authority: Clean-room design + Owner Final Product Lock + Duplicate Identity Addendum.
 * Rejected: legacy `community-crawler` product UX/status/orchestration as design SSOT.
 *
 * Product center:
 *   URL → [게시판 확인] (+ board duplicate) → READY|PARTIAL|UNSUPPORTED(+reason)
 *   → fetch ARTICLE DOCUMENT → article dedupe (NEW|UNCHANGED|SOURCE_UPDATED|SAME)
 *   → Admin policies (replacement, author, date, view, TARGET)
 *   → MANUAL select or AUTO
 *   → same transform → Community publisher (1 source article : max 1 DIBAY post)
 *   → Feed/Detail truth; failures operable; duplicates ≠ failures
 */

export const BOARD_IMPORT_PRODUCT_NAME = "외부 게시판 가져오기" as const;

/** Admin information architecture — exactly three surfaces. */
export const BOARD_IMPORT_ADMIN_SURFACES = [
  "external_boards",
  "imported_articles",
  "author_pools",
] as const;

export type BoardImportAdminSurface = (typeof BOARD_IMPORT_ADMIN_SURFACES)[number];

/** Article ops status shown to operators (not crawler tech statuses). */
export const BOARD_IMPORT_OPS_STATUSES = ["unpublished", "published", "failed"] as const;
export type BoardImportOpsStatus = (typeof BOARD_IMPORT_OPS_STATUSES)[number];

/** Board capability after [게시판 확인] — never mixed with article ops status. */
export const BOARD_CHECK_STATUSES = ["READY", "PARTIAL", "UNSUPPORTED"] as const;
export type BoardCheckStatus = (typeof BOARD_CHECK_STATUSES)[number];

export const BOARD_IMPORT_MODES = ["MANUAL", "AUTO"] as const;
export type BoardImportMode = (typeof BOARD_IMPORT_MODES)[number];

/** P0 integrity — duplicate identity is not optional / not a later CUT. */
export const BOARD_IMPORT_P0_INTEGRITY = [
  "source_board_no_duplicate_registration",
  "source_article_no_duplicate_collect_or_publish",
  "no_raw_url_only_identity",
  "source_update_is_not_new_article",
  "duplicate_is_not_failure",
  "manual_auto_same_identity_service",
  "db_unique_race_safe",
  "one_source_article_max_one_dibay_post",
  "target_does_not_define_source_identity",
  "admin_new_published_source_changed_failed",
] as const;
