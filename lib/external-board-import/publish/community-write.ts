import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";
import type { ExternalBoardTransformResult } from "@/lib/external-board-import/types";

export type CommunityWriteInput = ExternalBoardTransformResult & {
  images: string[];
};

/**
 * NEW Community materializer write path.
 * created_at omitted (DB now). published_at set explicitly.
 * Public attribution from explicit policy columns — not origin_kind gate.
 */
export async function writeImportedCommunityPost(
  sb: SupabaseClient,
  input: CommunityWriteInput
): Promise<{ postId: string }> {
  const principalId = await loadCommunityImportPrincipalUserId(sb);
  if (!principalId) {
    throw Object.assign(new Error("community_import_principal missing"), {
      failureStage: "publish",
      failureCode: "import_principal_missing",
    });
  }

  const payload: Record<string, unknown> = {
    user_id: principalId,
    origin_kind: "imported",
    display_author_name: input.displayAuthorName,
    display_author_avatar_url: input.displayAuthorAvatarUrl,
    title: input.title,
    content: input.content,
    summary: input.summary || summarizeCommunityPostContent(input.content),
    images: input.images,
    topic_id: input.topicId,
    topic_slug: input.topicSlug,
    location_id: input.locationId,
    region_label: input.regionLabel,
    status: "active",
    is_sample_data: false,
    is_question: false,
    is_meetup: false,
    published_at: input.publishedAtIso,
    view_count: input.viewSeed,
    public_attribution_name: input.publicAttributionName,
    public_attribution_url: input.publicAttributionUrl,
  };

  const { data, error } = await sb.from("community_posts").insert(payload).select("id").single();
  if (error) {
    throw Object.assign(new Error(error.message), {
      failureStage: "publish",
      failureCode: "community_insert_failed",
    });
  }
  return { postId: String((data as { id: string }).id) };
}
