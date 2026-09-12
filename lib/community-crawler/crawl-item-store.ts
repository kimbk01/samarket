import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedDetail } from "@/lib/community-crawler/adapters/generic-html";
import {
  assignDisplayAuthorOnce,
  assignDisplayDateOnce,
  assignDisplayViewOnce,
  contentFingerprint,
} from "@/lib/community-crawler/core/assign-display-once";
import { resolveDurableCoverFromLadder } from "@/lib/community-crawler/core/validate-cover-candidate";
import { parseSourceDate } from "@/lib/community-crawler/core/normalize";
import type {
  CommunityCrawlAuthorConfig,
  CommunityCrawlBoardRow,
  CommunityCrawlDateConfig,
  CommunityCrawlItemRow,
  CommunityCrawlItemStatus,
  CommunityCrawlSourceRow,
  CommunityCrawlViewConfig,
} from "@/lib/community-crawler/crawl-ssot";
import { applyCommunityCrawlReplacementRules } from "@/lib/community-crawler/replacement/apply-replacement-rules";
import { loadReplacementRulesForBoard } from "@/lib/community-crawler/replacement/replacement-rule-store";

function mapItem(row: Record<string, unknown>): CommunityCrawlItemRow {
  const images = Array.isArray(row.source_body_images) ? row.source_body_images.map(String) : [];
  return {
    id: String(row.id),
    source_id: String(row.source_id),
    board_id: String(row.board_id),
    run_id: row.run_id != null ? String(row.run_id) : null,
    source_post_id: row.source_post_id != null ? String(row.source_post_id) : null,
    canonical_url: String(row.canonical_url ?? ""),
    source_title: String(row.source_title ?? ""),
    source_body_normalized: String(row.source_body_normalized ?? ""),
    source_author: row.source_author != null ? String(row.source_author) : null,
    source_published_at: row.source_published_at != null ? String(row.source_published_at) : null,
    source_cover_url: row.source_cover_url != null ? String(row.source_cover_url) : null,
    source_cover_candidate_url:
      row.source_cover_candidate_url != null ? String(row.source_cover_candidate_url) : null,
    source_body_images: images,
    content_fingerprint: String(row.content_fingerprint ?? ""),
    display_author_name: row.display_author_name != null ? String(row.display_author_name) : null,
    display_author_avatar_url:
      row.display_author_avatar_url != null ? String(row.display_author_avatar_url) : null,
    display_date: row.display_date != null ? String(row.display_date) : null,
    display_view_seed: Number(row.display_view_seed ?? 0) || 0,
    dibay_title: String(row.dibay_title ?? ""),
    dibay_body: String(row.dibay_body ?? ""),
    target_topic_id: String(row.target_topic_id),
    status: row.status as CommunityCrawlItemStatus,
    manual_override: row.manual_override === true,
    published_post_id: row.published_post_id != null ? String(row.published_post_id) : null,
    persona_materialized_at:
      row.persona_materialized_at != null ? String(row.persona_materialized_at) : null,
    error_code: row.error_code != null ? String(row.error_code) : null,
    error_message: row.error_message != null ? String(row.error_message) : null,
    first_seen_at: String(row.first_seen_at),
    last_seen_at: String(row.last_seen_at),
    last_crawled_at: String(row.last_crawled_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listCommunityCrawlItems(
  sb: SupabaseClient,
  input: { boardId?: string; sourceId?: string; limit?: number }
): Promise<CommunityCrawlItemRow[]> {
  let q = sb.from("community_crawl_items").select("*").order("last_crawled_at", { ascending: false });
  if (input.boardId) q = q.eq("board_id", input.boardId);
  if (input.sourceId) q = q.eq("source_id", input.sourceId);
  q = q.limit(Math.min(200, Math.max(1, input.limit ?? 50)));
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function getCommunityCrawlItem(
  sb: SupabaseClient,
  id: string
): Promise<CommunityCrawlItemRow | null> {
  const { data, error } = await sb.from("community_crawl_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapItem(data as Record<string, unknown>) : null;
}

function initialStatus(source: CommunityCrawlSourceRow, board: CommunityCrawlBoardRow): CommunityCrawlItemStatus {
  if (source.policy_status === "DISABLED") return "SKIPPED";
  if (source.policy_status === "REVIEW_REQUIRED") return "REVIEW_REQUIRED";
  if (board.ingest_mode === "COLLECT_ONLY") return "DISCOVERED";
  if (board.ingest_mode === "AUTO_PUBLISH" && source.policy_status === "ALLOWED") return "READY";
  return "READY";
}

export type UpsertCrawlItemResult =
  | { outcome: "inserted"; item: CommunityCrawlItemRow }
  | { outcome: "updated"; item: CommunityCrawlItemRow }
  | { outcome: "duplicate"; item: CommunityCrawlItemRow }
  | { outcome: "failed"; errorCode: string; errorMessage: string; canonicalUrl: string };

/**
 * Upsert durable crawl item. Display author/date/view assigned once on INSERT only.
 * manual_override items: source fields may refresh; DIBAY draft fields preserved.
 *
 * Materialization (V2-2):
 * SAVE source_* → COPY → APPLY replacement rules → SAVE dibay_* (AUTO only).
 */
export async function upsertCommunityCrawlItem(input: {
  sb: SupabaseClient;
  board: CommunityCrawlBoardRow;
  source: CommunityCrawlSourceRow;
  runId: string | null;
  canonicalUrl: string;
  detail: ParsedDetail;
}): Promise<UpsertCrawlItemResult> {
  const { sb, board, source, runId, canonicalUrl, detail } = input;
  const now = new Date().toISOString();
  /** Cover ladder: validate in order; dead candidates never become durable covers. */
  const ladder =
    Array.isArray(detail.coverCandidateUrls) && detail.coverCandidateUrls.length
      ? detail.coverCandidateUrls
      : [detail.representativeImageUrl];
  const coverResolved = await resolveDurableCoverFromLadder(ladder);
  const durableCoverUrl = coverResolved.durableUrl;
  const coverCandidateUrl =
    coverResolved.primaryCandidate ||
    (detail.representativeImageUrl && /^https?:\/\//i.test(detail.representativeImageUrl.trim())
      ? detail.representativeImageUrl.trim()
      : null);
  const fingerprint = contentFingerprint(detail.title, detail.contentMarkdown, durableCoverUrl);

  const rules = await loadReplacementRulesForBoard(sb, {
    sourceId: source.id,
    boardId: board.id,
  });
  const materialized = applyCommunityCrawlReplacementRules({
    sourceTitle: detail.title,
    sourceBody: detail.contentMarkdown,
    rules,
  });

  let existingQuery = sb.from("community_crawl_items").select("*").eq("board_id", board.id);
  if (detail.sourcePostId) {
    existingQuery = existingQuery.eq("source_post_id", detail.sourcePostId);
  } else {
    existingQuery = existingQuery.eq("canonical_url", canonicalUrl);
  }
  const { data: existingRaw } = await existingQuery.maybeSingle();
  const existing = existingRaw ? mapItem(existingRaw as Record<string, unknown>) : null;

  if (existing) {
    if (existing.content_fingerprint === fingerprint) {
      const { data } = await sb
        .from("community_crawl_items")
        .update({
          last_seen_at: now,
          last_crawled_at: now,
          run_id: runId,
          updated_at: now,
          source_cover_candidate_url: coverCandidateUrl,
          source_cover_url: durableCoverUrl,
          source_body_images: detail.bodyImageUrls,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      return { outcome: "duplicate", item: data ? mapItem(data as Record<string, unknown>) : existing };
    }

    const patch: Record<string, unknown> = {
      source_title: detail.title,
      source_body_normalized: detail.contentMarkdown,
      source_author: detail.author,
      source_cover_url: durableCoverUrl,
      source_cover_candidate_url: coverCandidateUrl,
      source_body_images: detail.bodyImageUrls,
      content_fingerprint: fingerprint,
      last_seen_at: now,
      last_crawled_at: now,
      run_id: runId,
      updated_at: now,
      error_code: null,
      error_message: null,
    };
    if (!existing.manual_override) {
      patch.dibay_title = materialized.dibay_title;
      patch.dibay_body = materialized.dibay_body;
    }
    const { data, error } = await sb
      .from("community_crawl_items")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      return {
        outcome: "failed",
        errorCode: "ITEM_UPDATE_FAILED",
        errorMessage: error?.message ?? "update_failed",
        canonicalUrl,
      };
    }
    return { outcome: "updated", item: mapItem(data as Record<string, unknown>) };
  }

  const sourcePublishedAt = parseSourceDate(detail.dateRaw);

  const insertRow = {
    source_id: source.id,
    board_id: board.id,
    run_id: runId,
    source_post_id: detail.sourcePostId,
    canonical_url: canonicalUrl,
    source_title: detail.title,
    source_body_normalized: detail.contentMarkdown,
    source_author: detail.author,
    source_published_at: sourcePublishedAt,
    source_cover_url: durableCoverUrl,
    source_cover_candidate_url: coverCandidateUrl,
    source_body_images: detail.bodyImageUrls,
    content_fingerprint: fingerprint,
    display_author_name: null,
    display_author_avatar_url: null,
    display_date: null,
    display_view_seed: 0,
    dibay_title: "",
    dibay_body: "",
    target_topic_id: board.dibay_topic_id,
    status: "DISCOVERED" as CommunityCrawlItemStatus,
    manual_override: false,
    persona_materialized_at: null,
    first_seen_at: now,
    last_seen_at: now,
    last_crawled_at: now,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await sb.from("community_crawl_items").insert(insertRow).select("*").single();
  if (error || !data) {
    return {
      outcome: "failed",
      errorCode: "ITEM_INSERT_FAILED",
      errorMessage: error?.message ?? "insert_failed",
      canonicalUrl,
    };
  }
  return { outcome: "inserted", item: mapItem(data as Record<string, unknown>) };
}

export async function updateCommunityCrawlItemDraft(
  sb: SupabaseClient,
  id: string,
  patch: {
    dibay_title?: string;
    dibay_body?: string;
    display_author_name?: string;
    display_date?: string | null;
    display_view_seed?: number;
    status?: CommunityCrawlItemStatus;
    manual_override?: boolean;
  }
): Promise<CommunityCrawlItemRow> {
  const next: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    manual_override: true,
  };
  if (typeof patch.dibay_title === "string") next.dibay_title = patch.dibay_title.trim();
  if (typeof patch.dibay_body === "string") next.dibay_body = patch.dibay_body;
  if (typeof patch.display_author_name === "string") {
    next.display_author_name = patch.display_author_name.trim();
  }
  if (patch.display_date !== undefined) next.display_date = patch.display_date;
  if (typeof patch.display_view_seed === "number") {
    next.display_view_seed = Math.max(0, Math.floor(patch.display_view_seed));
  }
  if (patch.status) next.status = patch.status;
  if (typeof patch.manual_override === "boolean") next.manual_override = patch.manual_override;

  const { data, error } = await sb
    .from("community_crawl_items")
    .update(next)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "item_update_failed");
  return mapItem(data as Record<string, unknown>);
}

/** Hard-delete crawler operational item (does not delete community_posts). */
export async function deleteCommunityCrawlItem(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("community_crawl_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
