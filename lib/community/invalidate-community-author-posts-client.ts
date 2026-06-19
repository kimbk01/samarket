import { invalidateCommunityMyHubPostsCache } from "@/lib/community/fetch-community-my-hub-posts-deduped";
import { invalidateNeighborhoodFeedClientShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { forgetSingleFlightsWhere } from "@/lib/http/run-single-flight";

/**
 * 커뮤니티 글 작성 성공 직후 — 작성자 기준 목록·피드 클라이언트 캐시 무효화.
 * (`fetchCommunityMyHubPostsDeduped` 20s TTL, neighborhood feed short TTL, my-posts single-flight)
 */
export function invalidateCommunityAuthorPostsClientCaches(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  invalidateCommunityMyHubPostsCache(uid);
  invalidateNeighborhoodFeedClientShortTtl();
  forgetSingleFlightsWhere(
    (key) =>
      key.startsWith(`community:my-hub:posts:${uid}:`) || key.startsWith("me:community-posts:")
  );
}
