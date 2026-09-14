import type { SupabaseClient } from "@supabase/supabase-js";
import { writeExternalImportCommunityPost, nodesToCommunityContent } from "./community-write";

export type PublishEligibility =
  | { ok: true }
  | { ok: false; code: "already_published" | "deleted_keep" | "not_found" | "no_document" | "republish_required" };

export async function assertExternalArticlePublishEligible(
  sb: SupabaseClient,
  articleId: string
): Promise<PublishEligibility> {
  const { data: article } = await sb.from("external_articles").select("id").eq("id", articleId).maybeSingle();
  if (!article) return { ok: false, code: "not_found" };

  const { data: link } = await sb
    .from("external_publish_links")
    .select("status, community_post_id")
    .eq("article_id", articleId)
    .maybeSingle();

  if (!link || link.status === "never_published") return { ok: true };
  if (link.status === "republish_allowed") return { ok: true };
  if (link.status === "published" && link.community_post_id) return { ok: false, code: "already_published" };
  if (link.status === "deleted") return { ok: false, code: "republish_required" };
  return { ok: true };
}

export async function publishExternalImportArticles(input: {
  sb: SupabaseClient;
  articleIds: string[];
  topicId: string;
  topicSlug: string;
  regionLabel?: string | null;
}): Promise<{ published: Array<{ articleId: string; postId: string }>; failed: Array<{ articleId: string; code: string }> }> {
  const published: Array<{ articleId: string; postId: string }> = [];
  const failed: Array<{ articleId: string; code: string }> = [];

  // Server re-validates exact IDs — never trust client beyond the set of IDs.
  const uniqueIds = [...new Set(input.articleIds.map((id) => String(id).trim()).filter(Boolean))];

  for (const articleId of uniqueIds) {
    const gate = await assertExternalArticlePublishEligible(input.sb, articleId);
    if (!gate.ok) {
      failed.push({ articleId, code: gate.code });
      continue;
    }

    const { data: article } = await input.sb
      .from("external_articles")
      .select("id, title, author, published_at, canonical_url, thumbnail_candidate")
      .eq("id", articleId)
      .maybeSingle();
    if (!article) {
      failed.push({ articleId, code: "not_found" });
      continue;
    }

    const { data: doc } = await input.sb
      .from("external_article_documents")
      .select("title, author, published_at, draft_document, source_document, nodes, body_image_urls, gallery_image_urls, thumbnail_url, body_text")
      .eq("article_id", articleId)
      .maybeSingle();
    if (!doc) {
      failed.push({ articleId, code: "no_document" });
      continue;
    }

    const draft = (doc.draft_document as { title?: string; nodes?: unknown[] } | null) ?? null;
    const nodes = (Array.isArray(draft?.nodes) ? draft!.nodes : doc.nodes) as Array<{
      type: string;
      text?: string;
      src?: string;
      items?: string[];
      ordered?: boolean;
    }>;
    const title = String(draft?.title || doc.title || article.title || "").trim();
    const author = String(doc.author || article.author || "작성자").trim();
    // SOURCE clock only — never used as community_posts.published_at (Feed sort).
    const sourcePublishedAt = doc.published_at || article.published_at || null;

    const fromNodes = nodesToCommunityContent(nodes);
    const images =
      fromNodes.images.length > 0
        ? fromNodes.images
        : [
            ...(Array.isArray(doc.body_image_urls) ? doc.body_image_urls : []),
            ...(Array.isArray(doc.gallery_image_urls) ? doc.gallery_image_urls : []),
          ].filter((u): u is string => typeof u === "string" && u.trim().length > 0);

    // Thumbnail first for feed when present
    const thumb = doc.thumbnail_url || article.thumbnail_candidate;
    const orderedImages =
      thumb && !images.includes(thumb) ? [thumb, ...images] : images.length ? images : thumb ? [thumb] : [];

    const content = fromNodes.content || String(doc.body_text || "").trim();
    if (!title || !content) {
      failed.push({ articleId, code: "empty_content" });
      continue;
    }

    try {
      const { postId } = await writeExternalImportCommunityPost(input.sb, {
        title,
        content,
        images: orderedImages,
        topicId: input.topicId,
        topicSlug: input.topicSlug,
        regionLabel: input.regionLabel ?? null,
        displayAuthorName: author,
        sourcePublishedAtIso: sourcePublishedAt ? String(sourcePublishedAt) : null,
      });

      const now = new Date().toISOString();
      await input.sb.from("external_publish_links").upsert(
        {
          article_id: articleId,
          community_post_id: postId,
          community_topic_id: input.topicId,
          status: "published",
          published_at: now,
          deleted_at: null,
          republish_allowed_at: null,
          updated_at: now,
        },
        { onConflict: "article_id" }
      );

      published.push({ articleId, postId });
    } catch (e) {
      failed.push({ articleId, code: String((e as { code?: string })?.code || (e as Error).message || "publish_failed") });
    }
  }

  return { published, failed };
}

export async function markExternalPublishDeletedByCommunityPost(
  sb: SupabaseClient,
  communityPostId: string
): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from("external_publish_links")
    .update({
      status: "deleted",
      deleted_at: now,
      updated_at: now,
      // keep community_post_id for audit; article identity remains
    })
    .eq("community_post_id", communityPostId)
    .eq("status", "published");
}

export async function allowExternalImportRepublish(
  sb: SupabaseClient,
  articleId: string
): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("external_publish_links").upsert(
    {
      article_id: articleId,
      status: "republish_allowed",
      republish_allowed_at: now,
      community_post_id: null,
      updated_at: now,
    },
    { onConflict: "article_id" }
  );
}
