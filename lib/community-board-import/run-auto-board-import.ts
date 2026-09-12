/**
 * AUTO board-import orchestrator.
 *
 * ABSOLUTE: publish ONLY via boardImportCanonicalPublisher.publish
 * (same function MANUAL Admin publish uses). No second Community writer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBoardArticles } from "@/lib/community-board-import/fetch-board-articles";
import {
  listBoardImportSources,
  type BoardImportSourceRow,
} from "@/lib/community-board-import/store";
import { boardImportCanonicalPublisher } from "@/lib/community-board-import/transform-publish";

export type AutoBoardImportPublishItem = {
  articleId: string;
  outcome: "published" | "already_published" | "failed" | "skipped";
  communityPostId?: string;
  failure_stage?: string;
  failure_code?: string;
  failure_message?: string;
};

export type AutoBoardImportRunResult = {
  sourceBoardId: string;
  mode: string;
  fetchSummary: {
    discovered: number;
    newCount: number;
    unchangedDuplicate: number;
    sourceUpdated: number;
    sameArticle: number;
    fingerprintCollision: number;
  };
  /** Fetch-phase Community writes — always 0 (publish is separate). */
  fetchCommunityPostsWrite: 0;
  autoPublishCandidates: number;
  published: AutoBoardImportPublishItem[];
  skippedSourceUpdated: number;
  skippedDuplicateUnchanged: number;
  skippedOther: number;
  failed: number;
  newCommunityPostsCreated: number;
};

/**
 * Eligible AUTO publish: this-run outcome NEW + not forbidCommunity + articleId.
 * SOURCE_UPDATED / DUPLICATE_UNCHANGED never call publish for a new post.
 * (If already published, publisher is idempotent — we still skip calling it for non-NEW.)
 */
export function selectAutoPublishArticleIds(
  decisions: Array<{
    outcome: string;
    forbidNewCommunityPost: boolean;
    articleId: string | null;
    existingPublishedPostId: string | null;
  }>
): string[] {
  const out: string[] = [];
  for (const d of decisions) {
    if (d.outcome !== "NEW") continue;
    if (d.forbidNewCommunityPost) continue;
    if (!d.articleId) continue;
    if (d.existingPublishedPostId) continue;
    out.push(d.articleId);
  }
  return out;
}

export async function runAutoBoardImport(input: {
  sb: SupabaseClient;
  source: BoardImportSourceRow;
  maxArticles?: number;
}): Promise<AutoBoardImportRunResult> {
  if (input.source.mode !== "AUTO") {
    throw new Error("source_mode_not_auto");
  }
  if (!input.source.target_topic_id) {
    throw new Error("target_required");
  }

  const fetched = await fetchBoardArticles({
    sb: input.sb,
    source: input.source,
    maxArticles: input.maxArticles,
  });

  let skippedSourceUpdated = 0;
  let skippedDuplicateUnchanged = 0;
  let skippedOther = 0;
  for (const d of fetched.decisions) {
    if (d.outcome === "SOURCE_UPDATED") skippedSourceUpdated += 1;
    else if (d.outcome === "DUPLICATE_UNCHANGED" || d.outcome === "SAME_ARTICLE") {
      skippedDuplicateUnchanged += 1;
    } else if (d.outcome !== "NEW") skippedOther += 1;
  }

  const candidateIds = selectAutoPublishArticleIds(fetched.decisions);
  const published: AutoBoardImportPublishItem[] = [];
  let newCommunityPostsCreated = 0;
  let failed = 0;

  for (const articleId of candidateIds) {
    const result = await boardImportCanonicalPublisher.publish({
      sb: input.sb,
      articleId,
    });
    if (!result.ok) {
      failed += 1;
      published.push({
        articleId,
        outcome: "failed",
        failure_stage: result.failure_stage,
        failure_code: result.failure_code,
        failure_message: result.failure_message,
      });
      continue;
    }
    if (result.alreadyPublished) {
      published.push({
        articleId,
        outcome: "already_published",
        communityPostId: result.communityPostId,
      });
    } else {
      newCommunityPostsCreated += 1;
      published.push({
        articleId,
        outcome: "published",
        communityPostId: result.communityPostId,
      });
    }
  }

  return {
    sourceBoardId: input.source.id,
    mode: input.source.mode,
    fetchSummary: {
      discovered: fetched.summary.discovered,
      newCount: fetched.summary.newCount,
      unchangedDuplicate: fetched.summary.unchangedDuplicate,
      sourceUpdated: fetched.summary.sourceUpdated,
      sameArticle: fetched.summary.sameArticle,
      fingerprintCollision: fetched.summary.fingerprintCollision,
    },
    fetchCommunityPostsWrite: 0,
    autoPublishCandidates: candidateIds.length,
    published,
    skippedSourceUpdated,
    skippedDuplicateUnchanged,
    skippedOther,
    failed,
    newCommunityPostsCreated,
  };
}

export async function runAutoBoardImportDispatcher(input: {
  sb: SupabaseClient;
  maxBoards?: number;
  maxArticlesPerBoard?: number;
}): Promise<{
  scanned: number;
  results: AutoBoardImportRunResult[];
  errors: Array<{ sourceBoardId: string; error: string }>;
}> {
  const sources = (await listBoardImportSources(input.sb)).filter((s) => s.mode === "AUTO");
  const batch = sources.slice(0, Math.max(1, input.maxBoards ?? 5));
  const results: AutoBoardImportRunResult[] = [];
  const errors: Array<{ sourceBoardId: string; error: string }> = [];

  for (const source of batch) {
    try {
      const r = await runAutoBoardImport({
        sb: input.sb,
        source,
        maxArticles: input.maxArticlesPerBoard,
      });
      results.push(r);
    } catch (e) {
      errors.push({
        sourceBoardId: source.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { scanned: batch.length, results, errors };
}

/** Structural lock: AUTO must import this symbol for publish. */
export const AUTO_BOARD_IMPORT_PUBLISH_AUTHORITY = boardImportCanonicalPublisher.publish;
