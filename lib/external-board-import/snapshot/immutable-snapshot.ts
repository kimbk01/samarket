import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { fingerprintExternalBoardDocument } from "@/lib/external-board-import/identity/article-identity";
import { validateExternalBoardDocument } from "@/lib/external-board-import/document/ordered-document";
import { classifySourceUpdateSignal } from "@/lib/external-board-import/integrity/source-update";
import type { ExternalBoardArticleRow, ExternalBoardDocument, ExternalBoardSourceRow } from "@/lib/external-board-import/types";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";

/**
 * Fetch full article document and persist as an immutable snapshot version.
 * Never mutates prior snapshot bytes in place — bumps snapshot_version on change.
 * Technical fetch is not a public-rights gate (publish remains gated).
 */
export async function fetchAndPersistImmutableSnapshot(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  articleId: string
): Promise<ExternalBoardArticleRow> {
  const article = await getExternalBoardArticle(sb, articleId);
  if (!article || article.source_id !== source.id) {
    throw Object.assign(new Error("article_not_found"), {
      failureStage: "fetch",
      failureCode: "article_not_found",
    });
  }

  const { ctx, adapter } = resolveExternalBoardAdapter(source.source_url);
  if (!adapter) {
    throw Object.assign(new Error("no_adapter"), {
      failureStage: "fetch",
      failureCode: "no_adapter",
    });
  }

  const discoverItem = {
    stableArticleIdentity: article.stable_article_identity,
    identityKind: article.identity_kind,
    canonicalUrl: article.canonical_source_url,
    title: article.source_title,
    sampleDocument: article.source_document.nodes.length ? article.source_document : null,
    sourceAuthor: article.source_author,
    sourcePublishedAt: article.source_published_at,
  };
  const rawDoc = await adapter.fetchArticleDocument(ctx, discoverItem);

  const validated = validateExternalBoardDocument(rawDoc);
  if (!validated.ok) {
    throw Object.assign(new Error(validated.failureMessage), {
      failureStage: "document",
      failureCode: validated.failureCode,
    });
  }

  const document: ExternalBoardDocument = validated.document;
  const fp = fingerprintExternalBoardDocument(document);
  const signal = classifySourceUpdateSignal({
    previousFingerprint: article.content_fingerprint,
    nextFingerprint: fp,
    publishedPostId: article.published_post_id,
  });
  const now = new Date().toISOString();
  const changed = fp !== article.content_fingerprint;

  // Re-discover metadata via adapter discover of single URL when possible is host-specific;
  // preserve existing author/date unless document title changes.
  const { error } = await sb
    .from("external_board_articles")
    .update({
      source_document: document,
      source_title: document.title || article.source_title,
      content_fingerprint: fp,
      snapshot_version: changed ? article.snapshot_version + 1 : Math.max(article.snapshot_version, 1),
      article_signal: signal,
      source_changed_at: changed ? now : article.source_changed_at,
      last_seen_at: now,
      updated_at: now,
      failure_stage: null,
      failure_code: null,
      failure_message: null,
      failed_at: null,
      ops_status: article.published_post_id ? "published" : article.ops_status === "failed" ? "unpublished" : article.ops_status,
    })
    .eq("id", article.id);
  if (error) throw new Error(error.message);

  const updated = await getExternalBoardArticle(sb, article.id);
  if (!updated) throw new Error("article_missing_after_snapshot");
  return updated;
}
