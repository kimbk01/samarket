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
import { resolveCommunityCrawlPublishEligibility } from "@/lib/community-crawler/publish-eligibility";
import { publishCommunityCrawlFullContent } from "@/lib/community-crawler/publish-full-content";

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

  const eligibility = await resolveCommunityCrawlPublishEligibility(sb, {
    source,
    board,
    item,
    mode: "auto",
  });

  if (!eligibility.ok) {
    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: eligibility.eventClassification,
      errorCode: eligibility.reason,
      errorMessage: eligibility.detail ?? eligibility.reason,
    });

    if (
      eligibility.reason === "ALREADY_PUBLISHED" ||
      eligibility.reason === "ALREADY_LINKED"
    ) {
      stats.alreadyPublished += 1;
      // Heal item status if link exists but item not marked published.
      if (eligibility.reason === "ALREADY_LINKED" && eligibility.detail && !item.published_post_id) {
        await sb
          .from("community_crawl_items")
          .update({
            status: "PUBLISHED",
            published_post_id: eligibility.detail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
      }
      return {
        outcome: "already_published",
        communityPostId: eligibility.detail,
      };
    }

    if (eligibility.reason === "BOARD_NOT_AUTO_PUBLISH") {
      stats.skippedMode += 1;
      return { outcome: "skipped_mode", reason: eligibility.reason };
    }

    if (
      eligibility.reason === "SOURCE_POLICY_NOT_ALLOWED" ||
      eligibility.reason === "SOURCE_NOT_ACTIVE"
    ) {
      stats.skippedPolicy += 1;
      return { outcome: "skipped_policy", reason: eligibility.reason };
    }

    stats.failed += 1;
    return {
      outcome: "failed",
      reason: eligibility.detail || eligibility.reason,
    };
  }

  try {
    const result = await publishCommunityCrawlFullContent(sb, {
      boardId: item.board_id,
      canonicalUrl: item.canonical_url,
      sourcePostId: item.source_post_id,
      sourcePublishedAt: item.source_published_at,
      title: eligibility.title,
      content: eligibility.content,
      displayAuthorName: eligibility.displayAuthorName,
      displayAuthorAvatarUrl: item.display_author_avatar_url,
      createdAtIso: item.display_date,
      viewCount: item.display_view_seed,
    });

    if (!result.ok) {
      if (result.error === "already_imported") {
        stats.alreadyPublished += 1;
        await insertCommunityCrawlRunEvent(sb, {
          ...eventBase,
          classification: "DUPLICATE",
          errorCode: "ALREADY_PUBLISHED",
          errorMessage: result.communityPostId ?? "already_imported",
        });
        if (result.communityPostId) {
          await sb
            .from("community_crawl_items")
            .update({
              status: "PUBLISHED",
              published_post_id: result.communityPostId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        }
        return {
          outcome: "already_published",
          communityPostId: result.communityPostId,
        };
      }

      stats.failed += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "FAILED",
        errorCode: result.error,
        errorMessage: result.detail ?? result.error,
      });
      return { outcome: "failed", reason: result.error };
    }

    const { data: updated, error: updErr } = await sb
      .from("community_crawl_items")
      .update({
        status: "PUBLISHED",
        published_post_id: result.communityPostId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .select("*")
      .single();

    if (updErr) {
      // Post exists; item mark failed — record but do not treat as crawl rollback.
      stats.failed += 1;
      await insertCommunityCrawlRunEvent(sb, {
        ...eventBase,
        classification: "FAILED",
        errorCode: "ITEM_PUBLISH_MARK_FAILED",
        errorMessage: updErr.message,
      });
      return { outcome: "failed", reason: "ITEM_PUBLISH_MARK_FAILED" };
    }

    stats.published += 1;
    await insertCommunityCrawlRunEvent(sb, {
      ...eventBase,
      classification: "INSERTED",
      errorCode: "AUTO_PUBLISHED",
      errorMessage: result.communityPostId,
    });

    const nextItem = updated
      ? ({
          ...item,
          status: "PUBLISHED" as const,
          published_post_id: result.communityPostId,
        } satisfies CommunityCrawlItemRow)
      : {
          ...item,
          status: "PUBLISHED" as const,
          published_post_id: result.communityPostId,
        };

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
