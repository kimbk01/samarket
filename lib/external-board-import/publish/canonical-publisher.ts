import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";
import {
  claimExternalBoardPublish,
  releaseExternalBoardPublishClaim,
} from "@/lib/external-board-import/integrity/duplicate-guard";
import { assertPublishAllowedByPublicationState } from "@/lib/external-board-import/integrity/publication-tombstone";
import { rehostDocumentImages } from "@/lib/external-board-import/media/fetch-rehost";
import { buildExternalBoardTransform } from "@/lib/external-board-import/publish/build-transform";
import { writeImportedCommunityPost } from "@/lib/external-board-import/publish/community-write";
import { assertExternalBoardRightsDeclared } from "@/lib/external-board-import/rights/rights-gate";
import type { ExternalBoardArticleRow, ExternalBoardSourceRow } from "@/lib/external-board-import/types";

export type CanonicalPublishResult =
  | { ok: true; postId: string; communityDelta: 1 }
  | {
      ok: false;
      communityDelta: 0;
      failureStage: string;
      failureCode: string;
      failureMessage: string;
      alreadyPublishedPostId?: string;
    };

async function markArticleFailed(
  sb: SupabaseClient,
  articleId: string,
  stage: string,
  code: string,
  message: string
) {
  // LOCK 6: publish failure updates ops_status only — never force edit_status to published/failed.
  await sb
    .from("external_board_articles")
    .update({
      ops_status: "failed",
      failure_stage: stage,
      failure_code: code,
      failure_message: message.slice(0, 1000),
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", articleId);
}

/**
 * Sole NEW canonical publisher for external-board-import.
 * MANUAL and AUTO must call this only.
 */
export async function publishExternalBoardArticleCanonical(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  articleId: string,
  opts?: { fetchImpl?: typeof fetch }
): Promise<CanonicalPublishResult> {
  const rights = assertExternalBoardRightsDeclared({
    rightsStatus: source.rights_status,
    rightsBasis: source.rights_basis,
  });
  if (!rights.ok) {
    await markArticleFailed(sb, articleId, rights.failureStage, rights.failureCode, rights.failureMessage);
    return {
      ok: false,
      communityDelta: 0,
      failureStage: rights.failureStage,
      failureCode: rights.failureCode,
      failureMessage: rights.failureMessage,
    };
  }

  const article = await getExternalBoardArticle(sb, articleId);
  if (!article || article.source_id !== source.id) {
    return {
      ok: false,
      communityDelta: 0,
      failureStage: "publish",
      failureCode: "article_not_found",
      failureMessage: "Article not found for source.",
    };
  }

  const publishGate = assertPublishAllowedByPublicationState({
    publicationState: article.publication_state,
    publishedPostId: article.published_post_id,
  });
  if (!publishGate.ok) {
    return {
      ok: false,
      communityDelta: 0,
      failureStage: publishGate.failureStage,
      failureCode: publishGate.failureCode,
      failureMessage: publishGate.failureMessage,
      alreadyPublishedPostId: publishGate.alreadyPublishedPostId,
    };
  }

  if (article.article_signal === "SOURCE_UPDATED" && article.published_post_id) {
    return {
      ok: false,
      communityDelta: 0,
      failureStage: "claim",
      failureCode: "source_updated_no_new_post",
      failureMessage: "SOURCE_UPDATED must not create a new Community post.",
      alreadyPublishedPostId: article.published_post_id,
    };
  }

  const claim = await claimExternalBoardPublish(sb, article.id, article.published_post_id);
  if (!claim.ok) {
    if (claim.failureCode === "already_published") {
      return {
        ok: false,
        communityDelta: 0,
        failureStage: claim.failureStage,
        failureCode: claim.failureCode,
        failureMessage: claim.failureMessage,
        alreadyPublishedPostId: claim.alreadyPublishedPostId,
      };
    }
    await markArticleFailed(sb, article.id, claim.failureStage, claim.failureCode, claim.failureMessage);
    return {
      ok: false,
      communityDelta: 0,
      failureStage: claim.failureStage,
      failureCode: claim.failureCode,
      failureMessage: claim.failureMessage,
    };
  }

  try {
    const built = await buildExternalBoardTransform(sb, source, article);
    if (!built.ok) {
      await markArticleFailed(sb, article.id, built.failureStage, built.failureCode, built.failureMessage);
      return {
        ok: false,
        communityDelta: 0,
        failureStage: built.failureStage,
        failureCode: built.failureCode,
        failureMessage: built.failureMessage,
      };
    }

    await sb
      .from("external_board_articles")
      .update({
        chronology_case: built.transform.chronologyCase,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id);

    const principalId = await loadCommunityImportPrincipalUserId(sb);
    if (!principalId) {
      await markArticleFailed(sb, article.id, "publish", "import_principal_missing", "community_import_principal missing");
      return {
        ok: false,
        communityDelta: 0,
        failureStage: "publish",
        failureCode: "import_principal_missing",
        failureMessage: "community_import_principal missing",
      };
    }

    const rehosted = await rehostDocumentImages({
      sb,
      articleId: article.id,
      document: built.transform.document,
      principalUserId: principalId,
      fetchImpl: opts?.fetchImpl,
    });

    const communityBody = externalBoardDocumentToCommunityContent(rehosted.document);
    const { postId } = await writeImportedCommunityPost(sb, {
      ...built.transform,
      title: communityBody.title,
      content: communityBody.content,
      summary: communityBody.summary,
      // Role-filtered list from document (thumb + body/gallery); never decorative-only PASS.
      images: communityBody.images,
      document: rehosted.document,
    });

    const { error: linkErr } = await sb
      .from("external_board_articles")
      .update({
        published_post_id: postId,
        ops_status: "published",
        edit_status: "published",
        publication_state: "published",
        suppressed_at: null,
        suppression_reason: null,
        article_signal: "SAME_PUBLISHED",
        failure_stage: null,
        failure_code: null,
        failure_message: null,
        failed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", article.id)
      .is("published_post_id", null);

    if (linkErr) {
      await markArticleFailed(sb, article.id, "publish", "link_failed", linkErr.message);
      return {
        ok: false,
        communityDelta: 0,
        failureStage: "publish",
        failureCode: "link_failed",
        failureMessage: linkErr.message,
      };
    }

    return { ok: true, postId, communityDelta: 1 };
  } catch (e) {
    const err = e as { failureStage?: string; failureCode?: string; message?: string };
    const stage = err.failureStage || "publish";
    const code = err.failureCode || "publish_error";
    const message = err.message || String(e);
    await markArticleFailed(sb, article.id, stage, code, message);
    return {
      ok: false,
      communityDelta: 0,
      failureStage: stage,
      failureCode: code,
      failureMessage: message,
    };
  } finally {
    await releaseExternalBoardPublishClaim(sb, article.id);
  }
}

/** Re-export for AUTO scheduler — same authority. */
export async function publishExternalBoardArticleForAuto(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  article: ExternalBoardArticleRow
): Promise<CanonicalPublishResult> {
  return publishExternalBoardArticleCanonical(sb, source, article.id);
}
