import type { FeedCandidate } from "@/lib/types/home-feed";
import type { PostWithMeta } from "@/lib/posts/schema";
import type { ProductStatus } from "@/lib/types/product";

function locationParts(post: PostWithMeta): { region: string; city: string; barangay: string } {
  return {
    region: post.region?.trim() ?? "",
    city: post.city?.trim() ?? "",
    barangay: post.barangay?.trim() ?? "",
  };
}

function normalizeStatus(status: string): ProductStatus {
  if (status === "reserved" || status === "sold" || status === "hidden") return status;
  return "active";
}

export function postWithMetaToFeedCandidate(post: PostWithMeta): FeedCandidate {
  const sellerId = post.user_id?.trim() || post.author_id?.trim() || "";
  const { region, city, barangay } = locationParts(post);
  const meta = post.meta && typeof post.meta === "object" ? post.meta : null;
  const bumpedAt =
    meta && typeof meta.bumped_at === "string" ? meta.bumped_at : null;

  return {
    id: post.id,
    title: post.title,
    sellerId,
    sellerNickname: post.author_nickname?.trim() ?? "",
    memberType: "normal",
    businessProfileId: null,
    isBusinessItem: false,
    status: normalizeStatus(post.status),
    category: post.category_name?.trim() ?? "",
    price: post.price ?? 0,
    thumbnail: post.thumbnail_url ?? post.images?.[0] ?? "",
    createdAt: post.created_at,
    bumpedAt,
    region,
    city,
    barangay,
    distance: 999,
    likesCount: post.favorite_count ?? 0,
    chatCount: 0,
    viewCount: post.view_count ?? 0,
    adPromotionStatus: "none",
    pointPromotionStatus: "none",
    shopFeaturedStatus: "none",
    sourceTags: ["post"],
  };
}

export function postsToFeedCandidates(posts: PostWithMeta[]): FeedCandidate[] {
  return posts.map(postWithMetaToFeedCandidate);
}
