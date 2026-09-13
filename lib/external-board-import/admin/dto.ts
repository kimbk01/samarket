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
  mode: string;
  target_topic_slug: string | null;
  target_region_label: string | null;
  author_pool_id: string | null;
  last_checked_at: string | null;
  last_fetched_at: string | null;
};

export type ExternalBoardArticleAdminDto = {
  id: string;
  source_id: string;
  source_title: string;
  canonical_source_url: string;
  stable_article_identity: string;
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
  source_document: ExternalBoardArticleRow["source_document"];
};

export function toExternalBoardSourceAdminDto(row: ExternalBoardSourceRow): ExternalBoardSourceAdminDto {
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
    mode: row.mode,
    target_topic_slug: row.target_topic_slug,
    target_region_label: row.target_region_label,
    author_pool_id: row.author_pool_id,
    last_checked_at: row.last_checked_at,
    last_fetched_at: row.last_fetched_at,
  };
}

export function toExternalBoardArticleAdminDto(row: ExternalBoardArticleRow): ExternalBoardArticleAdminDto {
  return {
    id: row.id,
    source_id: row.source_id,
    source_title: row.source_title,
    canonical_source_url: row.canonical_source_url,
    stable_article_identity: row.stable_article_identity,
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
    source_document: row.source_document,
  };
}
