import type { PostWithMeta } from "@/lib/posts/schema";
import type { DetailSectionItem } from "./types";

export function postToDetailItem(post: PostWithMeta, opts?: { isAd?: boolean }): DetailSectionItem {
  return {
    id: post.id,
    title: post.title ?? "",
    thumbnail_url:
      post.thumbnail_url ??
      (Array.isArray(post.images) && post.images[0] ? post.images[0] : null),
    price: post.price ?? null,
    currency: null,
    region: post.region ?? null,
    city: post.city ?? null,
    status: post.status ?? null,
    isAd: opts?.isAd === true,
  };
}
