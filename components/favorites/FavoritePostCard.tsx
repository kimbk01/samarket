"use client";

import type { FavoritedPost } from "@/lib/favorites/getFavoritedPosts";
import { PostCard } from "@/components/post/PostCard";
import { FavoritePostTradeActions } from "@/components/favorites/FavoritePostTradeActions";
import type { PostListMenuAction } from "@/components/post/PostListMenuBottomSheet";
import { useTradeListCompositionMap } from "@/lib/trade/category-form/use-trade-list-composition-map";

interface FavoritePostCardProps {
  post: FavoritedPost;
  onUnfavorite?: () => void;
}

/** 찜 목록 카드 — 홈/카테고리 리스트와 동일한 PostCard + composition overlay */
export function FavoritePostCard({ post, onUnfavorite }: FavoritePostCardProps) {
  const { propsForCategoryId } = useTradeListCompositionMap();
  const composition = propsForCategoryId(post.category_id);
  return (
    <PostCard
      post={post}
      isFavorite={true}
      skinKey={composition?.skinKey}
      categorySlug={composition?.categorySlug}
      fieldComposition={composition?.fieldComposition}
      onFavoriteChange={(_postId, isFavorite) => {
        if (!isFavorite) onUnfavorite?.();
      }}
      onMenuAction={(_postId, action: PostListMenuAction) => {
        if (action === "delete_own") onUnfavorite?.();
      }}
      footer={<FavoritePostTradeActions post={post} />}
    />
  );
}
