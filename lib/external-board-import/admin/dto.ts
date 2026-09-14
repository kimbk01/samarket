/**
 * Admin-facing DTO mappers only — not Public product shapes.
 */

import type {
  ExternalBoardArticleRow,
  ExternalBoardSourceRow,
} from "@/lib/external-board-import/types";

export type ExternalBoardSourceAdminDto = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  site_key: string;
  board_key: string;
  check_status: string | null;
  check_reasons: unknown[];
  rights_status: string;
  rights_basis: string | null;
  attribution_required: boolean;
  attribution_display_name: string | null;
  board_sequence_verified: boolean;
  enabled: boolean;
  mode: string;
  target_topic_id: string | null;
  target_topic_slug: string | null;
  target_region_label: string | null;
  author_pool_id: string | null;
  last_checked_at: string | null;
  last_fetched_at: string | null;
  collected_count: number;
  unpublished_count: number;
  published_count: number;
  failed_count: number;
  last_error: string | null;
};

export type ExternalBoardArticleAdminDto = {
  id: string;
  source_id: string;
  source_title: string;
  canonical_source_url: string;
  stable_article_identity: string;
  source_author: string | null;
  source_published_at: string | null;
  source_page: number | null;
  source_sequence: number | null;
  source_language: string | null;
  detected_language: string | null;
  display_language: string | null;
  translation_status: string | null;
  ops_status: string;
  article_signal: string | null;
  published_post_id: string | null;
  chronology_case: string | null;
  operator_published_at: string | null;
  operator_batch_order: number | null;
  failure_stage: string | null;
  failure_code: string | null;
  failure_message: string | null;
  snapshot_version: number;
  has_image: boolean;
  thumbnail_url: string | null;
  draft_title: string | null;
  edit_status: string | null;
  source_document: ExternalBoardArticleRow["source_document"];
  draft_document: ExternalBoardArticleRow["draft_document"];
};

export function toExternalBoardSourceAdminDto(
  row: ExternalBoardSourceRow,
  metrics?: {
    collected_count: number;
    unpublished_count: number;
    published_count: number;
    failed_count: number;
    last_error: string | null;
  }
): ExternalBoardSourceAdminDto {
  return {
    id: row.id,
    site_name: row.site_name,
    source_board_name: row.source_board_name,
    source_url: row.source_url,
    site_key: row.site_key,
    board_key: row.board_key,
    check_status: row.check_status,
    check_reasons: row.check_reasons,
    rights_status: row.rights_status,
    rights_basis: row.rights_basis,
    attribution_required: row.attribution_required,
    attribution_display_name: row.attribution_display_name,
    board_sequence_verified: row.board_sequence_verified,
    enabled: row.enabled !== false,
    mode: row.mode,
    target_topic_id: row.target_topic_id,
    target_topic_slug: row.target_topic_slug,
    target_region_label: row.target_region_label,
    author_pool_id: row.author_pool_id,
    last_checked_at: row.last_checked_at,
    last_fetched_at: row.last_fetched_at,
    collected_count: metrics?.collected_count ?? 0,
    unpublished_count: metrics?.unpublished_count ?? 0,
    published_count: metrics?.published_count ?? 0,
    failed_count: metrics?.failed_count ?? 0,
    last_error: metrics?.last_error ?? null,
  };
}

export function toExternalBoardArticleAdminDto(row: ExternalBoardArticleRow): ExternalBoardArticleAdminDto {
  const doc = row.draft_document ?? row.source_document;
  // Feed thumb authority only — do not invent body image as thumb when feedThumb absent for "이미지 없음".
  const feedThumb = String(doc.feedThumbnailSrc ?? "").trim();
  const thumbnail_url = feedThumb || null;
  const has_image = Boolean(thumbnail_url);
  return {
    id: row.id,
    source_id: row.source_id,
    source_title: row.source_title,
    canonical_source_url: row.canonical_source_url,
    stable_article_identity: row.stable_article_identity,
    source_author: row.source_author,
    source_published_at: row.source_published_at,
    source_page: row.source_page ?? null,
    source_sequence: row.source_sequence ?? null,
    source_language: row.source_language,
    detected_language: row.detected_language,
    display_language: row.display_language,
    translation_status: row.translation_status,
    ops_status: row.ops_status,
    article_signal: row.article_signal,
    published_post_id: row.published_post_id,
    chronology_case: row.chronology_case,
    operator_published_at: row.operator_published_at,
    operator_batch_order: row.operator_batch_order,
    failure_stage: row.failure_stage,
    failure_code: row.failure_code,
    failure_message: row.failure_message,
    snapshot_version: row.snapshot_version,
    has_image,
    thumbnail_url,
    draft_title: row.draft_title,
    edit_status: row.edit_status,
    source_document: row.source_document,
    draft_document: row.draft_document,
  };
}

export function computeSourceArticleMetrics(articles: ExternalBoardArticleRow[]): Map<
  string,
  {
    collected_count: number;
    unpublished_count: number;
    published_count: number;
    failed_count: number;
    last_error: string | null;
  }
> {
  const map = new Map<
    string,
    {
      collected_count: number;
      unpublished_count: number;
      published_count: number;
      failed_count: number;
      last_error: string | null;
    }
  >();
  for (const a of articles) {
    const cur = map.get(a.source_id) ?? {
      collected_count: 0,
      unpublished_count: 0,
      published_count: 0,
      failed_count: 0,
      last_error: null,
    };
    cur.collected_count += 1;
    if (a.ops_status === "published" || a.published_post_id) cur.published_count += 1;
    else if (a.ops_status === "failed") {
      cur.failed_count += 1;
      if (!cur.last_error && a.failure_message) cur.last_error = a.failure_message;
    } else cur.unpublished_count += 1;
    map.set(a.source_id, cur);
  }
  return map;
}
