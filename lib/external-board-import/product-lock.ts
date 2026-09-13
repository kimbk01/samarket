/**
 * DIBAY EXTERNAL BOARD IMPORT — NEW CLEAN-ROOM PRODUCT LOCK
 *
 * Zero-base authority. Old community-board-import / community-crawler are NOT
 * design, schema, publisher, or salvage sources.
 *
 * SOURCE SIDE ≠ DIBAY COMMUNITY SIDE.
 * Public Feed/Detail read only community_posts.
 */

export const EXTERNAL_BOARD_PRODUCT_NAME = "외부 게시판 가져오기" as const;

export const EXTERNAL_BOARD_ADMIN_SURFACES = [
  "external_boards",
  "imported_articles",
  "author_pools",
] as const;

export type ExternalBoardAdminSurface = (typeof EXTERNAL_BOARD_ADMIN_SURFACES)[number];

export const EXTERNAL_BOARD_CHECK_STATUSES = ["READY", "PARTIAL", "UNSUPPORTED"] as const;
export type ExternalBoardCheckStatus = (typeof EXTERNAL_BOARD_CHECK_STATUSES)[number];

export const EXTERNAL_BOARD_OPS_STATUSES = ["unpublished", "published", "failed"] as const;
export type ExternalBoardOpsStatus = (typeof EXTERNAL_BOARD_OPS_STATUSES)[number];

export const EXTERNAL_BOARD_MODES = ["MANUAL", "AUTO"] as const;
export type ExternalBoardMode = (typeof EXTERNAL_BOARD_MODES)[number];

export const EXTERNAL_BOARD_RIGHTS_STATUSES = ["missing", "declared", "rejected"] as const;
export type ExternalBoardRightsStatus = (typeof EXTERNAL_BOARD_RIGHTS_STATUSES)[number];

export const EXTERNAL_BOARD_FAILURE_STAGES = [
  "rights",
  "verify",
  "discover",
  "fetch",
  "document",
  "media",
  "transform",
  "claim",
  "publish",
  "mapping",
] as const;
export type ExternalBoardFailureStage = (typeof EXTERNAL_BOARD_FAILURE_STAGES)[number];

export const EXTERNAL_BOARD_ARTICLE_SIGNALS = [
  "NEW",
  "UNCHANGED",
  "SOURCE_UPDATED",
  "SAME_PUBLISHED",
] as const;
export type ExternalBoardArticleSignal = (typeof EXTERNAL_BOARD_ARTICLE_SIGNALS)[number];

/** P0 integrity — not optional / not a later CUT. */
export const EXTERNAL_BOARD_P0_INTEGRITY = [
  "source_board_no_duplicate_registration",
  "source_article_no_duplicate_collect_or_publish",
  "no_raw_url_only_identity",
  "source_update_is_not_new_article",
  "duplicate_is_not_failure",
  "manual_auto_same_canonical_publisher",
  "db_unique_race_safe",
  "one_source_article_max_one_dibay_post",
  "target_does_not_define_source_identity",
  "preview_db_write_zero",
  "public_availability_is_not_republish_rights",
  "no_admin_css_selectors",
  "created_at_never_backdated",
  "published_at_is_dibay_public_chronology",
  "public_attribution_not_gated_by_origin_kind",
  "peer_cta_by_member_capability_not_origin_kind",
  "chronology_unknown_auto_blocked",
  "chronology_unknown_manual_requires_operator_authority",
  "no_invented_published_at",
] as const;

export const EXTERNAL_BOARD_CHRONOLOGY_CASES = ["A", "B", "C"] as const;
export type ExternalBoardChronologyCase = (typeof EXTERNAL_BOARD_CHRONOLOGY_CASES)[number];

/** CASE C Owner decision */
export const EXTERNAL_BOARD_UNKNOWN_CHRONOLOGY = {
  AUTO: "BLOCK",
  MANUAL: "ALLOW_WITH_EXPLICIT_OPERATOR_DATE_POLICY",
} as const;

/** Fixture PASS must never be promoted to FINAL real-source acceptance. */
export const EXTERNAL_BOARD_FIXTURE_IS_NOT_FINAL_ACCEPTANCE = true as const;

/** Real-source Production E2E blocked until Owner supplies URL + rights basis. */
export const EXTERNAL_BOARD_REAL_SOURCE_E2E_OWNER_GATE = "OWNER_URL_AND_RIGHTS_REQUIRED" as const;
