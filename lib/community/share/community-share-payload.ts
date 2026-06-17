import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";
import { buildCommunityPostCanonicalUrl } from "./community-share-url";

export type CommunityPostShareCardData = {
  postId: string;
  title: string;
  excerpt: string;
  categoryName: string;
  authorName: string;
  thumbnailUrl: string | null;
  canonicalUrl: string;
};

export type CommunityPostShareNativePayload = {
  title: string;
  text: string;
  url: string;
};

export type CommunityPostShareKakaoFeed = {
  objectType: "feed";
  content: {
    title: string;
    description: string;
    imageUrl: string;
    link: {
      mobileWebUrl: string;
      webUrl: string;
    };
  };
  buttons: Array<{
    title: string;
    link: {
      mobileWebUrl: string;
      webUrl: string;
    };
  }>;
};

const DEFAULT_OG_IMAGE_PATH = "/images/brand/dibay-auth-logo.png";

export function resolveCommunityPostShareOgImageUrl(
  post: Pick<NeighborhoodFeedPostDTO, "images">,
  siteOrigin: string
): string {
  const first = post.images?.find((u) => typeof u === "string" && u.trim());
  if (first?.trim()) return first.trim();
  return `${siteOrigin.replace(/\/$/, "")}${DEFAULT_OG_IMAGE_PATH}`;
}

export function buildCommunityPostExcerpt(
  post: Pick<NeighborhoodFeedPostDTO, "summary" | "content" | "title">,
  maxLen = 120
): string {
  const raw = (post.summary || post.content || post.title || "").trim();
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}

export function buildCommunityPostShareCardData(
  post: NeighborhoodFeedPostDTO,
  categoryLabel?: string
): CommunityPostShareCardData {
  const postId = post.id.trim();
  const thumbnailUrl = post.images?.find((u) => u?.trim())?.trim() ?? null;
  return {
    postId,
    title: post.title.trim() || "",
    excerpt: buildCommunityPostExcerpt(post),
    categoryName: (categoryLabel ?? post.category_label ?? post.category ?? "").trim(),
    authorName: communityAuthorDisplayName(post.author_name, post.author_name),
    thumbnailUrl,
    canonicalUrl: buildCommunityPostCanonicalUrl(postId),
  };
}

export function buildCommunityPostShareNativePayload(
  card: CommunityPostShareCardData
): CommunityPostShareNativePayload {
  const title = card.title || card.categoryName || "DIBAY";
  const text = [card.excerpt, card.authorName ? `— ${card.authorName}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { title, text, url: card.canonicalUrl };
}

export function buildCommunityPostShareKakaoFeed(
  card: CommunityPostShareCardData,
  defaultImageUrl: string
): CommunityPostShareKakaoFeed {
  const url = card.canonicalUrl;
  const imageUrl = card.thumbnailUrl || defaultImageUrl;
  return {
    objectType: "feed",
    content: {
      title: card.title || card.categoryName || "DIBAY",
      description: card.excerpt,
      imageUrl,
      link: { mobileWebUrl: url, webUrl: url },
    },
    buttons: [
      {
        title: "DIBAY에서 보기",
        link: { mobileWebUrl: url, webUrl: url },
      },
    ],
  };
}

/** 메신저 `community_post_share` metadata SSOT */
export function buildCommunityPostShareMessageMetadata(
  card: CommunityPostShareCardData
): Record<string, unknown> {
  return {
    kind: "community_post_share",
    postId: card.postId,
    title: card.title,
    excerpt: card.excerpt,
    categoryName: card.categoryName,
    authorName: card.authorName,
    thumbnailUrl: card.thumbnailUrl,
    canonicalUrl: card.canonicalUrl,
  };
}
