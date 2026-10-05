/**
 * PUBLISH / UPDATE: quality gate → content policy → image ingest → one DB transaction
 * (`community_import_publish` RPC: post + images + provenance link + draft + inbox).
 * Never auto-invoked by collection; always an explicit operator action (single or bulk job).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { resolveCommunityPublicRegionLabelForUser } from "@/lib/addresses/community-public-region-label";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { resolveTopicMeta } from "@/lib/community-feed/queries";
import { removeCanonicalImageAsset } from "@/lib/media/canonical-image-upload.server";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import { blocksToCommunityMarkdown, remapBlockImageUrls } from "./draft-apply";
import { ingestOperatorImageUrlList } from "./ingest-operator-images.server";
import { buildPublishContent } from "./publish-content";
import { mapPublishRpcError } from "./publish-errors";
import { assessArticleQuality } from "./quality";
import { type ImportRule, rulesFor } from "./rules";
import { loadManagedSource } from "./source-store";
import type { ContentPolicy, OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

export type PublishMode = "create" | "update";

export type PublishInput = {
  article: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  mode: PublishMode;
  adminUserId: string;
  /** Operator explicitly accepts a PARTIAL quality verdict. FAILED is never publishable. */
  acceptPartial?: boolean;
  rules: ImportRule[];
};

export type PublishResult =
  | {
      ok: true;
      postId: string;
      mode: PublishMode;
      policy: ContentPolicy;
      topicSlug: string;
      imageCount: number;
      warnings: string[];
    }
  | { ok: false; code: string; message: string };

const fail = (code: string, message: string): PublishResult => ({ ok: false, code, message });

function toIsoDisplayDate(edit: OperatorDraftEdit, article: OperatorNormalizedArticle): string | null {
  const raw = String(edit.displayDate || "").trim();
  if (raw) {
    const m = raw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m) {
      const iso = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}:00+08:00`;
      const t = Date.parse(iso);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
  }
  const t = Date.parse(String(article.sourcePublishedDate || ""));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function publishImportedArticle(sb: SupabaseClient, input: PublishInput): Promise<PublishResult> {
  const { article, edit } = input;
  const warnings: string[] = [];

  const quality = assessArticleQuality(article);
  if (quality.verdict === "FAILED") return fail("quality_failed", `품질 FAILED: ${quality.reasons.join(", ")}`);
  if (quality.verdict === "PARTIAL" && !input.acceptPartial) {
    return fail("quality_partial_needs_confirm", `품질 PARTIAL (${quality.reasons.join(", ")}) — 확인 후 게시하세요.`);
  }

  const source = await loadManagedSource(sb, article.sourceSite);
  if (!source) return fail("source_not_found", "출처를 찾을 수 없습니다.");
  const board = source.boards.find((b) => b.boardId === article.sourceBoard);
  if (!board) return fail("board_not_found", "게시판을 찾을 수 없습니다.");

  const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  let topicId = String(edit.topicId || "").trim();
  let topicSlug = String(edit.topicSlug || "").trim().toLowerCase();
  if (!topicId && board.defaultTopicId) {
    const { data: t } = await sb.from("community_topics").select("id, slug").eq("id", board.defaultTopicId).maybeSingle();
    if (t) {
      topicId = String((t as { id: string }).id);
      topicSlug = String((t as { slug: string }).slug);
    }
  }
  if (!topicId || !topicSlug) return fail("topic_required", "DIBAY 주제를 선택하세요.");
  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort || meta.id !== topicId) return fail("invalid_topic", "유효한 DIBAY 주제가 아닙니다.");
  if (meta.allow_meetup) return fail("meetup_topic_forbidden", "모임 주제로는 외부 글을 게시할 수 없습니다.");

  const principalId = await loadCommunityImportPrincipalUserId(sb);
  if (!principalId) return fail("import_principal_missing", "community_import_principal 이 없습니다.");

  const { data: sec, error: se } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("slug", sectionSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (se || !sec) return fail("section_missing", "커뮤니티 섹션을 찾을 수 없습니다.");

  const content = buildPublishContent({
    article,
    edit: { ...edit, topicId, topicSlug },
    sourcePolicy: source.contentPolicy,
    sourceName: source.displayName,
    rules: rulesFor(input.rules, article.sourceSite, article.sourceBoard),
  });
  if (!content.title) return fail("empty_content", "제목이 필요합니다.");

  // Images become DIBAY-owned copies; a failed image is dropped, never hot-linked.
  const ingested = await ingestOperatorImageUrlList({
    sb,
    ownerUserId: principalId,
    urls: content.imageUrls,
    pageReferer: article.canonicalUrl,
  });
  for (const f of ingested.failures) warnings.push(`image_dropped: ${f.error}`);
  if (content.policy === "full" && content.imageUrls.length > 0 && ingested.mapped.length === 0) {
    return fail("image_ingest_failed", "본문 이미지를 DIBAY 저장소로 가져오지 못했습니다.");
  }
  const urlMap = new Map(ingested.mapped.map((m) => [m.sourceUrl, m]));
  const ingestedUrls = new Map(ingested.mapped.map((m) => [m.sourceUrl, m.publicUrl]));
  const blocks = remapBlockImageUrls(content.blocks, ingestedUrls).filter(
    (b) => b.type !== "image" || ingested.mapped.some((m) => m.publicUrl === b.url),
  );
  const imageRows = content.imageUrls
    .map((u) => urlMap.get(u))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .slice(0, 40)
    .map((m, i) => ({ image_url: m.publicUrl, storage_path: m.storagePath, sort_order: i }));

  const markdown = blocksToCommunityMarkdown(blocks);
  if (!markdown) return fail("empty_content", "본문이 비어 있습니다.");

  let regionLabel = "동네";
  try {
    regionLabel = await resolveCommunityPublicRegionLabelForUser(sb, principalId);
  } catch {
    /* keep default */
  }

  const payload = {
    mode: input.mode,
    source_site: article.sourceSite,
    source_board: article.sourceBoard,
    source_article_key: article.sourceArticleKey,
    canonical_url: article.canonicalUrl,
    content_policy: content.policy,
    content_hash: createHash("sha1").update(`${content.title}\n${markdown}`).digest("hex"),
    actor_id: input.adminUserId,
    post: {
      user_id: principalId,
      section_id: (sec as { id: string }).id,
      section_slug: (sec as { slug: string }).slug,
      topic_id: meta.id,
      topic_slug: topicSlug,
      title: content.title,
      content: markdown,
      summary: summarizeCommunityPostContent(markdown),
      region_label: regionLabel,
      category: deriveCommunityPostCategoryBucket({ topicOrCategoryRaw: topicSlug, isMeetup: false }),
      display_author_name: String(edit.displayAuthor || article.author || "").trim() || content.attributionName,
      display_date: toIsoDisplayDate(edit, article),
      public_attribution_name: content.attributionName,
      public_attribution_url: content.attributionUrl,
    },
    image_rows: imageRows,
    draft: { original: article, edit: { ...edit, topicId: meta.id, topicSlug } },
  };

  const { data, error } = await sb.rpc("community_import_publish", { p: payload });
  if (error) {
    // Nothing was written by the RPC (single transaction): drop the copies made for this attempt.
    await Promise.all(
      ingested.mapped.map((m) =>
        removeCanonicalImageAsset({ sb, bucket: "post-images", originalPath: m.storagePath }).catch(() => undefined),
      ),
    );
    const m = mapPublishRpcError(error.message);
    return fail(m.code, m.message);
  }
  const postId = String((data as { post_id?: string } | null)?.post_id || "");
  if (!postId) return fail("publish_readback_failed", "게시 결과를 확인할 수 없습니다.");
  return {
    ok: true,
    postId,
    mode: input.mode,
    policy: content.policy,
    topicSlug,
    imageCount: imageRows.length,
    warnings,
  };
}
