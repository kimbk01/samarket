import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePublishAttribution } from "@/lib/external-board-import/attribution/public-attribution";
import { pickAuthorAliasForPublish } from "@/lib/external-board-import/author/author-pool";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";
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

  const rules = await listReplacementRules(sb, source.id);
  const baseDoc = opts?.documentOverride ?? article.source_document;
  if (!baseDoc.nodes.length && !baseDoc.title) {
    return {
      ok: false,
      failureStage: "document",
      failureCode: "empty_snapshot",
      failureMessage: "Article snapshot is empty. Fetch document first.",
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

  const replaced = applyReplacementPolicy(baseDoc, rules);
  const community = externalBoardDocumentToCommunityContent(replaced);
  const author = await pickAuthorAliasForPublish(sb, source.author_pool_id);
  const attribution = resolvePublishAttribution({
    attributionRequired: source.attribution_required,
    attributionDisplayName: source.attribution_display_name,
    siteName: source.site_name,
    canonicalSourceUrl: article.canonical_source_url,
  });

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
      topicId: mapping.mapping.topicId,
      topicSlug: mapping.mapping.topicSlug,
      locationId: mapping.mapping.locationId,
      regionLabel: mapping.mapping.regionLabel,
      document: replaced,
      publicAttributionName: attribution.publicAttributionName,
      publicAttributionUrl: attribution.publicAttributionUrl,
    },
  };
}
