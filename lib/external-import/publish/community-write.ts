/**
 * External-import → Community materializer.
 * published_at = DIBAY publish clock (now).
 * display_date = SOURCE_PUBLISHED_AT snapshot for public display (no N+1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityImportPrincipalUserId } from "../../community/community-import-principal";

function summarizeContent(content: string): string {
  const t = String(content || "").replace(/\s+/g, " ").trim();
  return t.length <= 160 ? t : `${t.slice(0, 157)}...`;
}

export type ExternalImportPublishInput = {
  title: string;
  content: string;
  summary?: string;
  images: string[];
  topicId: string;
  topicSlug: string;
  locationId?: string | null;
  regionLabel?: string | null;
  displayAuthorName: string;
  displayAuthorAvatarUrl?: string | null;
  /** SOURCE_PUBLISHED_AT — stored on display_date only */
  sourcePublishedAtIso?: string | null;
  viewSeed?: number;
};

export async function writeExternalImportCommunityPost(
  sb: SupabaseClient,
  input: ExternalImportPublishInput
): Promise<{ postId: string }> {
  const principalId = await loadCommunityImportPrincipalUserId(sb);
  if (!principalId) {
    throw Object.assign(new Error("community_import_principal missing"), {
      code: "import_principal_missing",
    });
  }

  const dibayPublishedAt = new Date().toISOString();
  const sourcePublishedAt =
    input.sourcePublishedAtIso && !Number.isNaN(Date.parse(input.sourcePublishedAtIso))
      ? new Date(input.sourcePublishedAtIso).toISOString()
      : null;

  const payload: Record<string, unknown> = {
    user_id: principalId,
    origin_kind: "imported",
    display_author_name: input.displayAuthorName,
    display_author_avatar_url: input.displayAuthorAvatarUrl ?? null,
    title: input.title,
    content: input.content,
    summary: input.summary || summarizeContent(input.content),
    images: input.images,
    topic_id: input.topicId,
    topic_slug: input.topicSlug,
    location_id: input.locationId ?? null,
    region_label: input.regionLabel ?? null,
    status: "active",
    is_sample_data: false,
    is_question: false,
    is_meetup: false,
    published_at: dibayPublishedAt,
    display_date: sourcePublishedAt,
    view_count: typeof input.viewSeed === "number" ? input.viewSeed : 0,
    public_attribution_name: null,
    public_attribution_url: null,
  };

  const { data, error } = await sb.from("community_posts").insert(payload).select("id").single();
  if (error) {
    // display_date may be absent on very old DBs — retry without it once.
    const msg = String(error.message || "");
    if (/display_date/i.test(msg)) {
      delete payload.display_date;
      const retry = await sb.from("community_posts").insert(payload).select("id").single();
      if (retry.error) {
        throw Object.assign(new Error(retry.error.message), { code: "community_insert_failed" });
      }
      return { postId: String((retry.data as { id: string }).id) };
    }
    throw Object.assign(new Error(error.message), { code: "community_insert_failed" });
  }
  const postId = String((data as { id: string }).id);

  const imageUrls = (input.images ?? []).filter((u) => typeof u === "string" && u.trim());
  if (imageUrls.length > 0) {
    const rows = imageUrls.map((url, i) => ({
      post_id: postId,
      image_url: url.trim(),
      storage_path: "",
      sort_order: i,
    }));
    const { error: imgErr } = await sb.from("community_post_images").insert(rows);
    if (imgErr) {
      await sb.from("community_posts").delete().eq("id", postId);
      throw Object.assign(new Error(imgErr.message), { code: "community_post_image_insert_failed" });
    }
  }

  return { postId };
}

export function nodesToCommunityContent(nodes: Array<{ type: string; text?: string; src?: string; items?: string[]; ordered?: boolean }>): {
  content: string;
  images: string[];
} {
  const images: string[] = [];
  const parts: string[] = [];
  for (const n of nodes) {
    if (n.type === "heading" && n.text) parts.push(`## ${n.text}`);
    else if (n.type === "paragraph" && n.text) parts.push(n.text);
    else if (n.type === "quote" && n.text) parts.push(`> ${n.text}`);
    else if (n.type === "list" && Array.isArray(n.items)) {
      for (const item of n.items) {
        parts.push(n.ordered ? `1. ${item}` : `- ${item}`);
      }
    } else if (n.type === "image" && n.src) {
      images.push(n.src);
      parts.push(`![image](${n.src})`);
    } else if (n.type === "caption" && n.text) {
      parts.push(`_${n.text}_`);
    }
  }
  return { content: parts.join("\n\n").trim(), images: [...new Set(images)] };
}
