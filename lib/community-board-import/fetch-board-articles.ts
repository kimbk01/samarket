import type { SupabaseClient } from "@supabase/supabase-js";
import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import {
  buildArticleDocumentFromHtml,
  discoverArticleLinks,
} from "@/lib/community-board-import/run-board-check";
import {
  buildSourceArticleIdentityFromDocument,
} from "@/lib/community-board-import/source-article-identity";
import {
  decideArticleDedupe,
  summarizeCrawlDedupe,
  type ArticleDedupeDecision,
} from "@/lib/community-board-import/article-dedupe";
import {
  findArticleByPrimaryIdentity,
  findArticlesByFingerprint,
  insertOrTouchArticle,
  type BoardImportSourceRow,
} from "@/lib/community-board-import/store";
import { makeFailureAudit } from "@/lib/community-board-import/failure-audit";

/** Per-link result for AUTO eligibility (MANUAL ignores articleId). */
export type BoardImportFetchDecision = ArticleDedupeDecision & {
  articleId: string | null;
};

export async function fetchBoardArticles(input: {
  sb: SupabaseClient;
  source: BoardImportSourceRow;
  maxArticles?: number;
}) {
  const max = input.maxArticles ?? 15;
  const list = await safeFetchHtml(input.source.source_url);
  const links = discoverArticleLinks(list.bodyText, list.finalUrl).slice(0, max);
  const decisions: BoardImportFetchDecision[] = [];

  for (const link of links) {
    try {
      const detail = await safeFetchHtml(link);
      const document = buildArticleDocumentFromHtml({
        html: detail.bodyText,
        canonicalUrl: detail.finalUrl,
      });
      const built = buildSourceArticleIdentityFromDocument({
        sourceBoardId: input.source.id,
        document,
        canonicalUrl: detail.finalUrl,
        finalUrl: detail.finalUrl,
      });
      if (!built.ok) {
        const fail = makeFailureAudit({
          stage: "ARTICLE_PARSE",
          code: built.code,
          message: built.message,
        });
        decisions.push({
          outcome: "NEW",
          forbidNewImportRow: false,
          forbidNewCommunityPost: true,
          existingPublishedPostId: null,
          adminHint: fail.failure_message,
          articleId: null,
        });
        continue;
      }

      const known = await findArticleByPrimaryIdentity(
        input.sb,
        input.source.id,
        built.identity.stableArticleIdentity
      );
      const others = await findArticlesByFingerprint(
        input.sb,
        input.source.id,
        built.identity.contentFingerprint
      );
      const other = others.find(
        (o) => o.stable_article_identity !== built.identity.stableArticleIdentity
      );

      const decision = decideArticleDedupe({
        incoming: built.identity,
        knownByPrimaryIdentity: known
          ? {
              identity: {
                sourceBoardId: known.source_board_id,
                stableArticleIdentity: known.stable_article_identity,
                identityKind: known.identity_kind as "stable_id" | "canonical_url" | "normalized_url",
                contentFingerprint: known.content_fingerprint,
              },
              contentFingerprint: known.content_fingerprint,
              publishedPostId: known.published_post_id,
              firstSeenAt: known.first_seen_at,
              lastSeenAt: known.last_seen_at,
              sourceChangedAt: known.source_changed_at,
            }
          : null,
        otherWithSameFingerprint: other
          ? {
              identity: {
                sourceBoardId: other.source_board_id,
                stableArticleIdentity: other.stable_article_identity,
                identityKind: other.identity_kind as "stable_id" | "canonical_url" | "normalized_url",
                contentFingerprint: other.content_fingerprint,
              },
              contentFingerprint: other.content_fingerprint,
              publishedPostId: other.published_post_id,
              firstSeenAt: other.first_seen_at,
              lastSeenAt: other.last_seen_at,
              sourceChangedAt: other.source_changed_at,
            }
          : null,
      });

      let articleId: string | null = null;
      if (decision.outcome === "NEW" || decision.outcome === "FINGERPRINT_COLLISION") {
        const row = await insertOrTouchArticle(input.sb, {
          sourceBoardId: input.source.id,
          identity: built.identity,
          document,
          canonicalSourceUrl: detail.finalUrl,
          decision: { kind: "NEW" },
        });
        articleId = row.id;
      } else if (decision.outcome === "DUPLICATE_UNCHANGED" && known) {
        const row = await insertOrTouchArticle(input.sb, {
          sourceBoardId: input.source.id,
          identity: built.identity,
          document,
          canonicalSourceUrl: detail.finalUrl,
          decision: { kind: "TOUCH_UNCHANGED", existingId: known.id },
        });
        articleId = row.id;
      } else if (decision.outcome === "SOURCE_UPDATED" && known) {
        const row = await insertOrTouchArticle(input.sb, {
          sourceBoardId: input.source.id,
          identity: built.identity,
          document,
          canonicalSourceUrl: detail.finalUrl,
          decision: { kind: "SOURCE_UPDATED", existingId: known.id },
        });
        articleId = row.id;
      }

      decisions.push({ ...decision, articleId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "fetch_failed";
      decisions.push({
        outcome: "NEW",
        forbidNewImportRow: true,
        forbidNewCommunityPost: true,
        existingPublishedPostId: null,
        adminHint: msg,
        articleId: null,
      });
    }
  }

  await input.sb
    .from("board_import_sources")
    .update({ last_fetched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", input.source.id);

  return {
    summary: summarizeCrawlDedupe(decisions),
    decisions,
    communityPostsWrite: 0 as const,
  };
}
