import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCommunityPublicRegionLabelForUser } from "@/lib/addresses/community-public-region-label";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { getPhilifeNeighborhoodSectionSlugServer } from "@/lib/community-feed/philife-neighborhood-section";
import { resolveTopicMeta } from "@/lib/community-feed/queries";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import {
  assertPublishGuards,
  blocksToCommunityMarkdown,
  buildAppliedContentBlocks,
  collectIncludedImageUrls,
} from "./draft-apply";
import { markOperatorImportDraftPublished, upsertOperatorImportDraft } from "./draft-store";
import type { OperatorDraftEdit, OperatorNormalizedArticle } from "./types";

export type PublishOperatorArticleInput = {
  article: OperatorNormalizedArticle;
  edit: OperatorDraftEdit;
  selectedArticleKeys: string[];
  adminUserId: string;
};

export type PublishOperatorArticleResult =
  | { ok: true; postId: string; selectedOnly: true; topicSlug: string }
  | { ok: false; code: string; message: string };

/**
 * Publish ONE explicitly selected article into normal community_posts.
 * No public source attribution block. Provenance stays on operator draft row.
 */
export async function publishOperatorSelectedArticle(
  sb: SupabaseClient,
  input: PublishOperatorArticleInput,
): Promise<PublishOperatorArticleResult> {
  const guard = assertPublishGuards({
    selectedArticleKeys: input.selectedArticleKeys,
    topicId: input.edit.topicId,
    topicSlug: input.edit.topicSlug,
  });
  if (!guard.ok) return guard;

  const keys = input.selectedArticleKeys.map((k) => String(k).trim());
  if (!keys.includes(input.article.sourceArticleKey)) {
    return {
      ok: false,
      code: "article_not_in_selection",
      message: "선택한 글만 게시할 수 있습니다. 현재 작업 글이 선택 목록에 없습니다.",
    };
  }
  if (keys.length !== 1) {
    return {
      ok: false,
      code: "multi_publish_requires_explicit_loop",
      message: `선택한 ${keys.length}개 글을 게시하려면 각 선택 글에 대해 명시적으로 게시하세요. 일괄 숨은 게시는 없습니다.`,
    };
  }

  const topicSlug = String(input.edit.topicSlug || "").trim().toLowerCase();
  const topicId = String(input.edit.topicId || "").trim();
  // Must match listOperatorImportTopicOptions section SSOT (philife neighborhood → often `dongnae`).
  // Hardcoded "philife" is not a live community_sections.slug and rejects valid topics.
  const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
  const meta = await resolveTopicMeta(sectionSlug, topicSlug);
  if (!meta || meta.is_feed_sort || meta.id !== topicId) {
    return { ok: false, code: "invalid_topic", message: "유효한 DIBAY 주제가 아닙니다." };
  }
  if (meta.allow_meetup) {
    return { ok: false, code: "meetup_topic_forbidden", message: "모임 주제로는 외부 글을 게시할 수 없습니다." };
  }

  const principalId = await loadCommunityImportPrincipalUserId(sb);
  if (!principalId) {
    return {
      ok: false,
      code: "import_principal_missing",
      message: "community_import_principal 이 없습니다. 운영 주체 사용자 등록이 필요합니다.",
    };
  }

  const appliedBlocks = buildAppliedContentBlocks(input.article, input.edit);
  const content = blocksToCommunityMarkdown(appliedBlocks);
  const title = String(input.edit.displayTitle || input.article.title || "").trim();
  if (!title || !content) {
    return { ok: false, code: "empty_content", message: "제목과 본문이 필요합니다." };
  }

  const { data: sec, error: se } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("slug", sectionSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (se || !sec) {
    return { ok: false, code: "section_missing", message: "커뮤니티 섹션을 찾을 수 없습니다." };
  }

  let region_label: string;
  try {
    region_label = await resolveCommunityPublicRegionLabelForUser(sb, principalId);
  } catch {
    region_label = "동네";
  }

  const categoryForDb = deriveCommunityPostCategoryBucket({
    topicOrCategoryRaw: topicSlug,
    isMeetup: false,
  });

  const displayAuthor = String(input.edit.displayAuthor || input.article.author || "").trim() || "DIBAY";
  const displayDateRaw = String(input.edit.displayDate || "").trim();
  let display_date: string | null = null;
  if (displayDateRaw) {
    const parsed = Date.parse(displayDateRaw.replace(/\./g, "-"));
    display_date = Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  } else if (input.article.sourcePublishedDate) {
    const m = String(input.article.sourcePublishedDate).match(/(\d{4})-(\d{2})-(\d{2}).*?(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      display_date = new Date(
        `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || "00"}+08:00`,
      ).toISOString();
    }
  }

  const imageUrls = collectIncludedImageUrls(appliedBlocks);

  const { data: inserted, error: insErr } = await sb
    .from("community_posts")
    .insert({
      user_id: principalId,
      section_id: (sec as { id: string }).id,
      section_slug: (sec as { slug: string }).slug,
      topic_id: meta.id,
      topic_slug: topicSlug,
      title,
      content,
      summary: summarizeCommunityPostContent(content),
      region_label,
      category: categoryForDb,
      images: [],
      is_question: false,
      is_meetup: false,
      meetup_place: null,
      meetup_date: null,
      status: "active",
      is_sample_data: false,
      origin_kind: "imported",
      display_author_name: displayAuthor,
      display_author_avatar_url: null,
      display_date,
      // Public attribution intentionally absent (PHASE D lock).
      public_attribution_name: null,
      public_attribution_url: null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return {
      ok: false,
      code: "community_post_insert_failed",
      message: insErr?.message || "community_posts 등록에 실패했습니다.",
    };
  }

  const postId = (inserted as { id: string }).id;
  if (imageUrls.length > 0) {
    const rows = imageUrls.slice(0, 40).map((url, i) => ({
      post_id: postId,
      image_url: url,
      storage_path: "",
      sort_order: i,
    }));
    const { error: imgErr } = await sb.from("community_post_images").insert(rows);
    if (imgErr) {
      await sb.from("community_posts").delete().eq("id", postId);
      return {
        ok: false,
        code: "community_post_image_insert_failed",
        message: imgErr.message || "이미지 저장에 실패했습니다.",
      };
    }
  }

  try {
    await upsertOperatorImportDraft(sb, {
      original: input.article,
      edit: input.edit,
      updatedBy: input.adminUserId,
    });
    await markOperatorImportDraftPublished(sb, {
      sourceSite: input.article.sourceSite,
      sourceBoard: input.article.sourceBoard,
      sourceArticleKey: input.article.sourceArticleKey,
      publishedPostId: postId,
      edit: input.edit,
    });
  } catch {
    // Post already created; draft link is best-effort for audit.
  }

  return { ok: true, postId, selectedOnly: true, topicSlug };
}
