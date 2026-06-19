import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCommunityPostIdForAds } from "@/lib/community-feed/ensure-community-post-for-ads";

/**
 * 레거시 `posts`(type=community) → `community_posts` SSOT 미러.
 * 피드·내 글·프로필 작성글 목록 정합용.
 */
export async function mirrorLegacyCommunityPostToSsot(
  sb: SupabaseClient,
  postId: string,
  userId: string
): Promise<string | null> {
  return ensureCommunityPostIdForAds(sb, postId, userId);
}
