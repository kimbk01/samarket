import type {
  ExternalBoardArticleSignal,
  ExternalBoardCheckStatus,
  ExternalBoardFailureStage,
  ExternalBoardMode,
  ExternalBoardOpsStatus,
  ExternalBoardRightsStatus,
} from "@/lib/external-board-import/product-lock";

export type ExternalBoardNode =
  | { type: "paragraph"; text: string }
  | { type: "image"; src: string; alt?: string; mediaId?: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "link"; href: string; text: string };

export type ExternalBoardDocument = {
  title: string;
  canonicalUrl: string;
  nodes: ExternalBoardNode[];
  /**
   * Feed thumbnail candidate only (e.g. WP featured_media).
   * Never serialized into Detail body markdown.
   */
  feedThumbnailSrc?: string | null;
};

export type ExternalBoardIdentityKind = "stable_id" | "canonical_url" | "normalized_url";

export type ExternalBoardSourceRow = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  site_key: string;
  board_key: string;
  target_topic_id: string | null;
  target_topic_slug: string | null;
  target_location_id: string | null;
  target_region_label: string | null;
  mode: ExternalBoardMode;
  check_status: ExternalBoardCheckStatus | null;
  check_reasons: unknown[];
  rights_basis: string | null;
  rights_status: ExternalBoardRightsStatus;
  /** Explicit rights/attribution policy — NOT origin_kind. */
  attribution_required: boolean;
  attribution_display_name: string | null;
  /** CASE B board sequence verified. */
  board_sequence_verified: boolean;
  /** Operator 사용/중지 */
  enabled: boolean;
  author_pool_id: string | null;
  date_recent_min_days: number;
  date_recent_max_days: number;
  view_seed_min: number;
  view_seed_max: number;
  last_checked_at: string | null;
  last_fetched_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalBoardArticleRow = {
  id: string;
  source_id: string;
  stable_article_identity: string;
  identity_kind: ExternalBoardIdentityKind;
  content_fingerprint: string;
  canonical_source_url: string;
  source_title: string;
  source_document: ExternalBoardDocument;
  /** DIBAY editable title — raw source_title preserved */
  draft_title: string | null;
  /** DIBAY editable document — raw source_document preserved */
  draft_document: ExternalBoardDocument | null;
  edit_status: "collected" | "editing" | "saved" | "published" | "failed" | null;
  source_author: string | null;
  source_published_at: string | null;
  /** 1-based discovery page when known. */
  source_page: number | null;
  /** 0-based batch sequence when known. */
  source_sequence: number | null;
  chronology_case: "A" | "B" | "C" | null;
  operator_published_at: string | null;
  operator_batch_order: number | null;
  snapshot_version: number;
  ops_status: ExternalBoardOpsStatus;
  article_signal: ExternalBoardArticleSignal | null;
  published_post_id: string | null;
  failure_stage: ExternalBoardFailureStage | null;
  failure_code: string | null;
  failure_message: string | null;
  failed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_changed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalBoardDiscoverItem = {
  stableArticleIdentity: string;
  identityKind: ExternalBoardIdentityKind;
  canonicalUrl: string;
  title: string;
  sampleDocument?: ExternalBoardDocument | null;
  /** Original source author when extractable — not DIBAY public author. */
  sourceAuthor?: string | null;
  /** Parsed source published time as ISO when unambiguous; else null. */
  sourcePublishedAt?: string | null;
  /** 1-based list page where this item was discovered. */
  sourcePage?: number | null;
  /** 0-based order within the discovery batch (0 = first/newest collected). */
  sourceSequence?: number | null;
  /** Exact list/API URL fetched for this item's source page (page-range proof). */
  visitedListUrl?: string | null;
};

export type ExternalBoardTransformResult = {
  title: string;
  content: string;
  summary: string;
  images: string[];
  displayAuthorName: string;
  displayAuthorAvatarUrl: string | null;
  publishedAtIso: string;
  chronologyCase: "A" | "B" | "C";
  viewSeed: number;
  topicId: string | null;
  topicSlug: string | null;
  locationId: string | null;
  regionLabel: string | null;
  document: ExternalBoardDocument;
  publicAttributionName: string | null;
  publicAttributionUrl: string | null;
};

export type ExternalBoardPreviewResult = {
  ok: true;
  writeDelta: 0;
  transform: ExternalBoardTransformResult;
} | {
  ok: false;
  writeDelta: 0;
  failureStage: ExternalBoardFailureStage;
  failureCode: string;
  failureMessage: string;
};
