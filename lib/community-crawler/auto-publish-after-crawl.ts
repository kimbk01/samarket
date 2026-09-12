/**
 * Auto-publish continuation after REAL crawl materialization.
 * Reuses V2-1 publishCommunityCrawlFullContent only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { insertCommunityCrawlRunEvent } from "@/lib/community-crawler/core/run-events";
import type {
  CommunityCrawlBoardRow,
  CommunityCrawlItemRow,
  CommunityCrawlSourceRow,
} from "@/lib/community-crawler/crawl-ssot";
import { loadCanonicalPublishImagesFromItemMedia } from "@/lib/community-crawler/media/canonical-publish-images";
import { validateFullContentDraftForPublish } from "@/lib/community-crawler/publish-full-content-draft";
import { publishCommunityCrawlFullContent } from "@/lib/community-crawler/publish-full-content";
import { materializeAndPublishItem } from "@/lib/community-crawler/core/materialize-item-persona";

export type AutoPublishAttemptStats = {
  attempted: number;
  published: number;
  alreadyPublished: number;
  skippedPolicy: number;
  skippedMode: number;
  failed: number;
};

export type AutoPublishAttemptResult =
  | { outcome: "published"; communityPostId: string; item: CommunityCrawlItemRow }
  | { outcome: "already_published"; communityPostId?: string }
  | { outcome: "skipped_policy"; reason: string }
  | { outcome: "skipped_mode"; reason: string }
  | { outcome: "failed"; reason: string };

export function emptyAutoPublishAttemptStats(): AutoPublishAttemptStats {
  return {
    attempted: 0,
    published: 0,
    alreadyPublished: 0,
    skippedPolicy: 0,
    skippedMode: 0,
    failed: 0,
  };
}

/**
 * Attempt canonical FULL_CONTENT publish for one materialized crawl item.
 * Never mutates source_* / dibay_* (manual override preserved).
 * Publish failure does not roll back crawl materialization.
 */
export async function attemptAutoPublishAfterCrawl(input: {
  sb: SupabaseClient;
  source: CommunityCrawlSourceRow;
  board: CommunityCrawlBoardRow;
  item: CommunityCrawlItemRow;
  runId: string | null;
  stats: AutoPublishAttemptStats;
}): Promise<AutoPublishAttemptResult> {
  const { sb, source, board, item, runId, stats } = input;
  stats.attempted += 1;

  const eventBase = {
    runId,
    sourceId: source.id,
    boardId: board.id,
    sourcePostId: item.source_post_id,
    canonicalUrl: item.canonical_url,
    phase: "PUBLISH" as const,
  };

  if (board.ingest_mode !== "AUTO_PUBLISH") {
    stats.skippedMode += 1;
    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: "PUBLISH_BLOCKED_POLICY",
      errorCode: "BOARD_NOT_AUTO_PUBLISH",
      errorMessage: `ingest_mode=${board.ingest_mode}`,
    });
    return { outcome: "skipped_mode", reason: "BOARD_NOT_AUTO_PUBLISH" };
  }

  if (source.status !== "ACTIVE" || source.policy_status !== "ALLOWED") {
    stats.skippedPolicy += 1;
    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: "PUBLISH_BLOCKED_POLICY",
      errorCode: source.status !== "ACTIVE" ? "SOURCE_NOT_ACTIVE" : "SOURCE_POLICY_NOT_ALLOWED",
      errorMessage: `policy_status=${source.policy_status}`,
    });
    return { outcome: "skipped_policy", reason: "SOURCE_POLICY_NOT_ALLOWED" };
  }

  if (item.published_post_id && item.status === "PUBLISHED") {
    stats.alreadyPublished += 1;
    return {
      outcome: "already_published",
      communityPostId: item.published_post_id ?? undefined,
    };
  }

  try {
    // If not yet materialized and no manual override, materialize persona and publish
    if (!item.persona_materialized_at && !item.manual_override && !item.display_author_name) {
      const result = await materializeAndPublishItem(sb, {
        item,
        board,
        source,
        runId,
      });

      if (!result.ok) {
        stats.failed += 1;
        await insertCommunityCrawlRunEvent(sb, {
          ...eventBase,
          classification: "FAILED",
          errorCode: result.error,
          errorMessage: result.detail ?? result.error,
        });
        return { outcome: "failed", reason: result.error };
      }

      stats.published += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "INSERTED",
        errorCode: "AUTO_PUBLISHED",
        errorMessage: result.communityPostId,
      });

      return {
        outcome: "published",
        communityPostId: result.communityPostId,
        item: {
          ...item,
          status: "PUBLISHED",
          published_post_id: result.communityPostId,
        },
      };
    }

    // Materialized or manual override path: validate draft
    const draft = validateFullContentDraftForPublish({
      draftTitle: item.dibay_title || item.source_title,
      draftContent: item.dibay_body,
    });
    if (!draft.ok) {
      stats.failed += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "FAILED",
        errorCode: "DRAFT_INVALID",
        errorMessage: draft.error,
      });
      return { outcome: "failed", reason: "DRAFT_INVALID" };
    }

    // Publish directly with canonical images
    const images = await loadCanonicalPublishImagesFromItemMedia(sb, item.id);
    const result = await publishCommunityCrawlFullContent(sb, {
      boardId: item.board_id,
      canonicalUrl: item.canonical_url,
      sourcePostId: item.source_post_id,
      sourcePublishedAt: item.source_published_at,
      title: item.dibay_title || item.source_title,
      content: item.dibay_body || item.source_body_normalized,
      displayAuthorName: item.display_author_name || "DIBAY 에디터",
      displayAuthorAvatarUrl: item.display_author_avatar_url,
      createdAtIso: item.display_date,
      viewCount: item.display_view_seed,
      images,
    });

    if (!result.ok) {
      stats.failed += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "FAILED",
        errorCode: result.error,
        errorMessage: result.detail ?? result.error,
      });
      return { outcome: "failed", reason: result.error };
    }

    const { error: updErr } = await sb
      .from("community_crawl_items")
      .update({
        status: "PUBLISHED",
        published_post_id: result.communityPostId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updErr) {
      stats.failed += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "FAILED",
        errorCode: "ITEM_PUBLISH_MARK_FAILED",
        errorMessage: updErr.message,
      });
      return { outcome: "failed", reason: "ITEM_PUBLISH_MARK_FAILED" };
    }

    if (result.updated) {
      stats.alreadyPublished += 1;
    } else {
      stats.published += 1;
    }

    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: result.updated ? "UPDATED" : "INSERTED",
      errorCode: result.updated ? "AUTO_PUBLISH_UPSERT" : "AUTO_PUBLISHED",
      errorMessage: result.communityPostId,
    });

    const nextItem = {
      ...item,
      status: "PUBLISHED" as const,
      published_post_id: result.communityPostId,
    } satisfies CommunityCrawlItemRow;

    return {
      outcome: "published",
      communityPostId: result.communityPostId,
      item: nextItem,
    };
  } catch (e) {
    stats.failed += 1;
    const message = e instanceof Error ? e.message : String(e);
    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: "FAILED",
      errorCode: "AUTO_PUBLISH_EXCEPTION",
      errorMessage: message,
    });
    return { outcome: "failed", reason: message };
  }
}
