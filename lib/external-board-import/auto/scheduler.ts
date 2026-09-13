import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getExternalBoardSource,
  listExternalBoardSources,
} from "@/lib/external-board-import/registry/source-board-store";
import { listExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";
import { publishExternalBoardArticleCanonical } from "@/lib/external-board-import/publish/canonical-publisher";
import { assertExternalBoardRightsDeclared } from "@/lib/external-board-import/rights/rights-gate";

export type AutoRunSummary = {
  sourcesScanned: number;
  published: number;
  skipped: number;
  failed: number;
  results: Array<{ sourceId: string; articleId: string; ok: boolean; code?: string; postId?: string }>;
};

/**
 * AUTO = scheduler + eligibility only. Same canonical publisher as MANUAL.
 */
export async function runExternalBoardAutoPublish(
  sb: SupabaseClient,
  opts?: { limitPerSource?: number }
): Promise<AutoRunSummary> {
  const sources = await listExternalBoardSources(sb);
  const autoSources = sources.filter((s) => s.mode === "AUTO");
  const limit = Math.min(Math.max(opts?.limitPerSource ?? 3, 1), 20);
  const summary: AutoRunSummary = {
    sourcesScanned: autoSources.length,
    published: 0,
    skipped: 0,
    failed: 0,
    results: [],
  };

  for (const source of autoSources) {
    const rights = assertExternalBoardRightsDeclared({
      rightsStatus: source.rights_status,
      rightsBasis: source.rights_basis,
    });
    if (!rights.ok) {
      summary.skipped += 1;
      continue;
    }
    if (source.check_status !== "READY" && source.check_status !== "PARTIAL") {
      summary.skipped += 1;
      continue;
    }

    const fresh = await getExternalBoardSource(sb, source.id);
    if (!fresh) continue;

    const articles = await listExternalBoardArticles(sb, source.id);
    const queue = articles
      .filter((a) => !a.published_post_id && a.ops_status !== "published")
      .filter((a) => a.source_document.nodes.length > 0)
      .slice(0, limit);

    for (const article of queue) {
      const result = await publishExternalBoardArticleCanonical(sb, fresh, article.id);
      if (result.ok) {
        summary.published += 1;
        summary.results.push({
          sourceId: source.id,
          articleId: article.id,
          ok: true,
          postId: result.postId,
        });
      } else if (result.failureCode === "already_published" || result.failureCode === "claim_held") {
        summary.skipped += 1;
        summary.results.push({
          sourceId: source.id,
          articleId: article.id,
          ok: false,
          code: result.failureCode,
        });
      } else {
        summary.failed += 1;
        summary.results.push({
          sourceId: source.id,
          articleId: article.id,
          ok: false,
          code: result.failureCode,
        });
      }
    }
  }

  return summary;
}
