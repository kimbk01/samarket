import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildSourceBoardIdentity,
  detectSourceBoardDuplicate,
  type ExistingSourceBoardHit,
} from "@/lib/community-board-import/source-board-identity";
import type { BoardCheckStatus } from "@/lib/community-board-import/product-lock";
import type { BoardImportMode } from "@/lib/community-board-import/product-lock";
import type { ArticleDocument } from "@/lib/community-board-import/article-document";
import type { SourceArticleIdentity } from "@/lib/community-board-import/source-article-identity";

export type BoardImportSourceRow = {
  id: string;
  site_name: string;
  source_board_name: string;
  source_url: string;
  site_key: string;
  board_key: string;
  target_topic_id: string | null;
  mode: BoardImportMode;
  check_status: BoardCheckStatus | null;
  check_reasons: unknown;
  author_pool_id: string | null;
  date_recent_min_days: number;
  date_recent_max_days: number;
  view_seed_min: number;
  view_seed_max: number;
  last_checked_at: string | null;
  last_fetched_at: string | null;
};

export type BoardImportArticleRow = {
  id: string;
  source_board_id: string;
  stable_article_identity: string;
  identity_kind: string;
  content_fingerprint: string;
  canonical_source_url: string;
  source_title: string;
  source_document: ArticleDocument;
  source_author: string | null;
  source_date_iso: string | null;
  first_seen_at: string;
  last_seen_at: string;
  source_changed_at: string | null;
  published_post_id: string | null;
  publish_inflight_at?: string | null;
  failure_stage: string | null;
  failure_code: string | null;
  failure_message: string | null;
  failed_at: string | null;
};

export async function listBoardImportSources(sb: SupabaseClient): Promise<BoardImportSourceRow[]> {
  const { data, error } = await sb
    .from("board_import_sources")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BoardImportSourceRow[];
}

export async function listExistingBoardHits(sb: SupabaseClient): Promise<ExistingSourceBoardHit[]> {
  const rows = await listBoardImportSources(sb);
  return rows.map((r) => ({
    identity: { siteKey: r.site_key, boardKey: r.board_key },
    siteName: r.site_name,
    sourceBoardName: r.source_board_name,
    targetLabel: r.target_topic_id ?? "(TARGET 미지정)",
    existingBoardId: r.id,
  }));
}

export async function findBoardDuplicateByUrl(
  sb: SupabaseClient,
  boardUrl: string,
  finalUrl?: string | null
) {
  const candidate = buildSourceBoardIdentity({ boardUrl, finalUrl });
  const existing = await listExistingBoardHits(sb);
  return { candidate, result: detectSourceBoardDuplicate({ candidate, existing }) };
}

export async function upsertBoardImportSource(
  sb: SupabaseClient,
  input: {
    siteName: string;
    sourceBoardName: string;
    sourceUrl: string;
    finalUrl?: string | null;
    targetTopicId: string | null;
    mode: BoardImportMode;
    authorPoolId?: string | null;
    dateRecentMinDays?: number;
    dateRecentMaxDays?: number;
    viewSeedMin?: number;
    viewSeedMax?: number;
  }
): Promise<{ ok: true; row: BoardImportSourceRow } | { ok: false; duplicate: ExistingSourceBoardHit }> {
  const { candidate, result } = await findBoardDuplicateByUrl(sb, input.sourceUrl, input.finalUrl);
  if (result.duplicate) {
    return { ok: false, duplicate: result.existing };
  }
  const { data, error } = await sb
    .from("board_import_sources")
    .insert({
      site_name: input.siteName.trim(),
      source_board_name: input.sourceBoardName.trim(),
      source_url: input.sourceUrl.trim(),
      site_key: candidate.siteKey,
      board_key: candidate.boardKey,
      target_topic_id: input.targetTopicId,
      mode: input.mode,
      author_pool_id: input.authorPoolId ?? null,
      date_recent_min_days: input.dateRecentMinDays ?? 3,
      date_recent_max_days: input.dateRecentMaxDays ?? 10,
      view_seed_min: input.viewSeedMin ?? 100,
      view_seed_max: input.viewSeedMax ?? 500,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const again = await findBoardDuplicateByUrl(sb, input.sourceUrl, input.finalUrl);
      if (again.result.duplicate) return { ok: false, duplicate: again.result.existing };
    }
    throw error;
  }
  return { ok: true, row: data as BoardImportSourceRow };
}

export async function updateBoardCheckResult(
  sb: SupabaseClient,
  sourceId: string,
  input: {
    checkStatus: BoardCheckStatus;
    checkReasons: unknown;
  }
) {
  const { error } = await sb
    .from("board_import_sources")
    .update({
      check_status: input.checkStatus,
      check_reasons: input.checkReasons,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
  if (error) throw error;
}

export async function updateBoardImportSourceMode(
  sb: SupabaseClient,
  sourceId: string,
  mode: BoardImportMode
): Promise<BoardImportSourceRow> {
  const { data, error } = await sb
    .from("board_import_sources")
    .update({ mode, updated_at: new Date().toISOString() })
    .eq("id", sourceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as BoardImportSourceRow;
}

export async function listBoardImportArticles(
  sb: SupabaseClient,
  sourceBoardId: string
): Promise<BoardImportArticleRow[]> {
  const { data, error } = await sb
    .from("board_import_articles")
    .select("*")
    .eq("source_board_id", sourceBoardId)
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BoardImportArticleRow[];
}

export async function findArticleByPrimaryIdentity(
  sb: SupabaseClient,
  sourceBoardId: string,
  stableArticleIdentity: string
): Promise<BoardImportArticleRow | null> {
  const { data, error } = await sb
    .from("board_import_articles")
    .select("*")
    .eq("source_board_id", sourceBoardId)
    .eq("stable_article_identity", stableArticleIdentity)
    .maybeSingle();
  if (error) throw error;
  return (data as BoardImportArticleRow | null) ?? null;
}

export async function findArticlesByFingerprint(
  sb: SupabaseClient,
  sourceBoardId: string,
  contentFingerprint: string
): Promise<BoardImportArticleRow[]> {
  const { data, error } = await sb
    .from("board_import_articles")
    .select("*")
    .eq("source_board_id", sourceBoardId)
    .eq("content_fingerprint", contentFingerprint);
  if (error) throw error;
  return (data ?? []) as BoardImportArticleRow[];
}

export async function insertOrTouchArticle(
  sb: SupabaseClient,
  input: {
    sourceBoardId: string;
    identity: SourceArticleIdentity;
    document: ArticleDocument;
    canonicalSourceUrl: string;
    sourceAuthor?: string | null;
    sourceDateIso?: string | null;
    decision:
      | { kind: "NEW" }
      | { kind: "TOUCH_UNCHANGED"; existingId: string }
      | { kind: "SOURCE_UPDATED"; existingId: string }
      | {
          kind: "FAIL";
          stage: string;
          code: string;
          message: string;
        };
  }
): Promise<BoardImportArticleRow> {
  const now = new Date().toISOString();
  if (input.decision.kind === "NEW") {
    const { data, error } = await sb
      .from("board_import_articles")
      .insert({
        source_board_id: input.sourceBoardId,
        stable_article_identity: input.identity.stableArticleIdentity,
        identity_kind: input.identity.identityKind,
        content_fingerprint: input.identity.contentFingerprint,
        canonical_source_url: input.canonicalSourceUrl,
        source_title: input.document.title,
        source_document: input.document,
        source_author: input.sourceAuthor ?? null,
        source_date_iso: input.sourceDateIso ?? null,
        first_seen_at: now,
        last_seen_at: now,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as BoardImportArticleRow;
  }

  if (input.decision.kind === "TOUCH_UNCHANGED") {
    const { data, error } = await sb
      .from("board_import_articles")
      .update({ last_seen_at: now, updated_at: now })
      .eq("id", input.decision.existingId)
      .select("*")
      .single();
    if (error) throw error;
    return data as BoardImportArticleRow;
  }

  if (input.decision.kind === "SOURCE_UPDATED") {
    const { data, error } = await sb
      .from("board_import_articles")
      .update({
        content_fingerprint: input.identity.contentFingerprint,
        source_title: input.document.title,
        source_document: input.document,
        source_author: input.sourceAuthor ?? null,
        source_date_iso: input.sourceDateIso ?? null,
        last_seen_at: now,
        source_changed_at: now,
        updated_at: now,
      })
      .eq("id", input.decision.existingId)
      .select("*")
      .single();
    if (error) throw error;
    return data as BoardImportArticleRow;
  }

  const { data, error } = await sb
    .from("board_import_articles")
    .insert({
      source_board_id: input.sourceBoardId,
      stable_article_identity: input.identity.stableArticleIdentity,
      identity_kind: input.identity.identityKind,
      content_fingerprint: input.identity.contentFingerprint,
      canonical_source_url: input.canonicalSourceUrl,
      source_title: input.document.title,
      source_document: input.document,
      failure_stage: input.decision.stage,
      failure_code: input.decision.code,
      failure_message: input.decision.message,
      failed_at: now,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as BoardImportArticleRow;
}
