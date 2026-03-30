import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";

/**
 * 본문에서 대표 이미지 URL 추출 (마크다운 이미지 → HTML img → 확장자 URL).
 * 목록 썸네일 보조용.
 */
export function extractFirstImageUrlFromPostContent(content: string): string | null {
  const c = content.replace(/\s+/g, " ").trim();
  if (!c) return null;
  const md = c.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)/i);
  if (md?.[1]) return md[1]!.trim();
  const img = c.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img?.[1]) return img[1]!.trim();
  const bare = c.match(/(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?)/i);
  return bare?.[1]?.trim() ?? null;
}

export function resolveNeighborhoodFeedListThumbnail(post: NeighborhoodFeedPostDTO): string | null {
  for (const u of post.images) {
    if (typeof u === "string" && u.trim()) return u.trim();
  }
  return extractFirstImageUrlFromPostContent(post.content);
}

export function resolveCommunityFeedListThumbnail(post: CommunityFeedPostDTO): string | null {
  if (post.thumbnail_url?.trim()) return post.thumbnail_url.trim();
  return extractFirstImageUrlFromPostContent(post.content);
}
