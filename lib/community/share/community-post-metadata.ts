import type { Metadata } from "next";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import {
  buildCommunityPostExcerpt,
  resolveCommunityPostShareOgImageUrl,
} from "./community-share-payload";
import { buildCommunityPostCanonicalUrl, resolveCommunityShareSiteOrigin } from "./community-share-url";
import { communityAuthorDisplayName } from "@/lib/community/community-author-display";

export function buildCommunityPostPageMetadata(post: NeighborhoodFeedPostDTO): Metadata {
  const origin = resolveCommunityShareSiteOrigin();
  const title = post.title.trim() || post.category_label || "DIBAY";
  const description =
    buildCommunityPostExcerpt(post, 160) ||
    `${communityAuthorDisplayName(post.author_name, "")} · DIBAY`;
  const url = buildCommunityPostCanonicalUrl(post.id);
  const images = [resolveCommunityPostShareOgImageUrl(post, origin)];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: "article",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
    alternates: { canonical: url },
  };
}
