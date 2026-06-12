import type { Product } from "@/lib/types/product";
import type { PostWithMeta } from "@/lib/posts/schema";

export function postWithMetaToSearchProduct(post: PostWithMeta): Product {
  const sellerId = post.user_id?.trim() || post.author_id?.trim() || "";
  const location = [post.region, post.city, post.barangay].filter(Boolean).join(" · ");
  return {
    id: post.id,
    title: post.title,
    description: post.content ?? "",
    price: post.price ?? 0,
    thumbnail: post.thumbnail_url ?? post.images?.[0] ?? "",
    category: post.category_name?.trim() ?? "",
    location,
    status: post.status === "reserved" || post.status === "sold" ? post.status : "active",
    sellerId,
    seller: sellerId
      ? {
          id: sellerId,
          nickname: post.author_nickname?.trim() ?? "",
          location,
          avatar: post.author_avatar_url ?? "",
        }
      : undefined,
    likesCount: post.favorite_count ?? 0,
    chatCount: 0,
    viewCount: post.view_count ?? 0,
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    bumpedAt: undefined,
    distance: 999,
    isBoosted: false,
  };
}

export function postsToSearchProducts(posts: PostWithMeta[]): Product[] {
  return posts.map(postWithMetaToSearchProduct);
}
