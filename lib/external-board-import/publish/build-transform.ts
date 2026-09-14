import type { SupabaseClient } from "@supabase/supabase-js";
import { pickAuthorAliasForPublish } from "@/lib/external-board-import/author/author-pool";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";
import { assertWriteEligibleTopicId } from "@/lib/external-board-import/mapping/assert-write-eligible-topic";
import { resolveTargetMapping } from "@/lib/external-board-import/mapping/target-mapping";
import { applyReplacementPolicy, listReplacementRules } from "@/lib/external-board-import/policy/replacement";
import {
  computeViewSeed,
  resolveExternalBoardPublishedAt,
} from "@/lib/external-board-import/publish/chronology";
import type {
  ExternalBoardArticleRow,
  ExternalBoardDocument,
  ExternalBoardSourceRow,
  ExternalBoardTransformResult,
} from "@/lib/external-board-import/types";

export type BuildTransformOptions = {
  documentOverride?: ExternalBoardDocument;
  /** CASE B sequence index (0 = newest). */
  sequenceIndex?: number | null;
  sequenceBaseNow?: Date;
};

/**
 * Shared deterministic transform for Preview and Publish.
 * Does not rehost media or write DB.
 */
export async function buildExternalBoardTransform(
  sb: SupabaseClient,
  source: ExternalBoardSourceRow,
  article: ExternalBoardArticleRow,
  opts?: BuildTransformOptions
): Promise<
  | { ok: true; transform: ExternalBoardTransformResult }
  | {
      ok: false;
      failureStage: "mapping" | "transform" | "document" | "publish";
      failureCode: string;
      failureMessage: string;
    }
> {
  const mapping = resolveTargetMapping(source);
  if (!mapping.ok) {
    return {
      ok: false,
      failureStage: "mapping",
      failureCode: mapping.failureCode,
      failureMessage: mapping.failureMessage,
    };
  }

  const topicAssert = await assertWriteEligibleTopicId(sb, mapping.mapping.topicId);
  if (!topicAssert.ok) {
    return {
      ok: false,
      failureStage: "mapping",
      failureCode: topicAssert.failureCode,
      failureMessage: topicAssert.failureMessage,
    };
  }

  const rules = await listReplacementRules(sb, source.id);
  // Draft wins when saved; raw source_document is never overwritten by transform.
  const baseDoc = opts?.documentOverride ?? article.draft_document ?? article.source_document;
  const draftTitle = article.draft_title;
  if (!baseDoc.nodes.length && !baseDoc.title && !draftTitle) {
    return {
      ok: false,
      failureStage: "document",
      failureCode: "empty_snapshot",
      failureMessage: "수집된 본문이 없습니다. 먼저 게시물을 불러오세요.",
    };
  }

  const chronology = resolveExternalBoardPublishedAt({
    source,
    article,
    mode: source.mode,
    sequenceIndex:
      opts?.sequenceIndex ??
      (article.operator_batch_order != null ? article.operator_batch_order : null),
    sequenceBaseNow: opts?.sequenceBaseNow,
  });
  if (!chronology.ok) {
    return {
      ok: false,
      failureStage: "publish",
      failureCode: chronology.failureCode,
      failureMessage: chronology.failureMessage,
    };
  }

  const replaced = applyReplacementPolicy(
    draftTitle?.trim() ? { ...baseDoc, title: draftTitle.trim() } : baseDoc,
    rules
  );
  const community = externalBoardDocumentToCommunityContent(replaced);
  const author = await pickAuthorAliasForPublish(sb, source.author_pool_id);

  return {
    ok: true,
    transform: {
      title: community.title,
      content: community.content,
      summary: community.summary,
      images: community.images,
      displayAuthorName: author.displayName,
      displayAuthorAvatarUrl: author.avatarUrl,
      publishedAtIso: chronology.publishedAtIso,
      chronologyCase: chronology.case,
      viewSeed: computeViewSeed(source),
      topicId: topicAssert.topic.id,
      topicSlug: topicAssert.topic.slug,
      locationId: mapping.mapping.locationId,
      regionLabel: mapping.mapping.regionLabel,
      document: replaced,
      // PUBLIC: never write source attribution. Admin keeps canonical_source_url.
      publicAttributionName: null,
      publicAttributionUrl: null,
    },
  };
}
